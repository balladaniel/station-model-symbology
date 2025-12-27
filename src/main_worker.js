/**
 * station-model-symbology: main_worker.js
 * 
 * Decodes SYNOP reports with Python module pymetdecoder, within Pyodide. Requires "pymetdecoder.zip" in the same folder
 */

console.log('WEB WORKER INITIALIZING (before receiving any message)')

importScripts("https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.js") // pyodide from CDN
//importScripts("./pyodide.js") // pyodide locally

var messageQueue = [];
let pyodideStarting = false;
let processQueueIsRunning = false;
var ctx;
let startTimePyodideStartup, endTimePyodideStartup;
let startTimePyodideImport, endTimePyodideImport;
var base;
var absolute;

async function startPyodide() {
    console.log('WORKER: Pyodide is not running, starting up...')
    // Load Pyodide
    startTimePyodideStartup = performance.now();
    pyodideStarting = true;
    var pyodide = await loadPyodide({fullStdLib: false});
    console.log(`WORKER: Pyodide version ${pyodide.version} started.`)
    endTimePyodideStartup = performance.now();

    // get, then import pymetdecoder lib in Pyodide env
    startTimePyodideImport = performance.now();
    let response = await fetch(absolute); // .zip, .whl, ...
    //let response = await fetch("./pymetdecoder.zip"); // .zip, .whl, ...
    let buffer = await response.arrayBuffer();
    await pyodide.unpackArchive(buffer, "zip"); // by default, unpacks to the current dir
    pyodide.pyimport("pymetdecoder");
    endTimePyodideImport = performance.now();

    console.log('WORKER: Pymetdecoder imported, starting processing Queue')
    pyodideStarting = false;

    console.table({
        'Pyodide startup': Math.round(endTimePyodideStartup - startTimePyodideStartup),
        'Import pymetdecoder': Math.round(endTimePyodideImport - startTimePyodideImport),
    });

    return pyodide;
}



function decodeSynop(encoded) {

    console.debug('decodeSynop starting to process:', encoded)

    const dataToPass = {
        synopString: encoded.SYNOP_raw
    }
    
    // get dict and insert our input data to pass to Python env
    const dict = ctx.globals.get("dict");
    const globals = dict(Object.entries(dataToPass));
    dict.destroy()  // avoiding memory leaks. See: https://pyodide.org/en/stable/usage/type-conversions.html#proxying-from-python-into-javascript

    const startTimeSynop = performance.now();
    // run python code:
    var decoded = ctx.runPython(`       
        import json
        from pymetdecoder import synop as s 
        decoded = s.SYNOP().decode(synopString)
        json.dumps(decoded)
    `, {globals});

    const endTimeSynop = performance.now();

    // parse decoded data to JSON
    var parsed = JSON.parse(decoded)
    parsed['_raw'] = encoded.SYNOP_raw; // include raw encoded SYNOP string for debug purposes

    console.debug("WORKER: Posting message back to main script");
    // send decoded SYNOP data out of worker to the Main code thread
    postMessage({decoded: parsed, leafletID: encoded.leafletID});
    const endTimeWorker = performance.now();

    //console.debug(`WORKER: finished working. Took ${Math.round(endTimeWorker - startTimeWorker)} ms total, of which:`)
 
    console.debug('This Synop decoding took (ms)', Math.round(endTimeSynop - startTimeSynop))
}

function processQueue(){
    processQueueIsRunning = true;
    while (messageQueue.length > 0) {
        decodeSynop(messageQueue.shift());
    }
    console.log('WORKER: Queue processing finished, queue is now empty.')
    processQueueIsRunning = false;
}

function handleMessage(e){  
    console.log("WORKER: Message received from main script, with data:", e.data);

    const startTimeWorker = performance.now();

    if (e.data.SYNOP_raw == null) {
        // attrib SYNOP_raw is null in feature attributes, dont process
        postMessage({decoded: null, leafletID: e.data.leafletID});
    } else {
        // check if pyodide is still starting when the message is received. If so, put in queue.
        if (pyodideStarting) {
            console.log('WORKER: Pyodide still starting! Message/data put into queue.')
            messageQueue.push(e.data);
            //console.log(messageQueue)
        } else {
        // pyodide is running, put msg in queue. If processing the queue is not running, start.
            messageQueue.push(e.data);
            if (!processQueueIsRunning) {
                processQueue()
            }
        }
    }

}

onmessage = (e) => {
    if (e.data.hasOwnProperty('SYNOP_raw')) {
        handleMessage(e);
    } else {
    
        // to have current baseURI: https://stackoverflow.com/a/4019297
        base = e.data;
        absolute = new URL( "./pymetdecoder.zip", base );   //pymetdecoder.zip should also be supplied. Always in the same folder, as the main JS file (bundle or not)
        console.log('base ', base, absolute)

        startPyodide().then(pyodide => {
            ctx = pyodide;
            if (messageQueue.length > 0) {
                processQueue(pyodide)
            }
        })
    }
}