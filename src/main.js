/**
 * station-model-symbology: main.js
 * 
 * The main code logic for building station model symbols. Requires "main_worker.js" in the same folder, as it is the Web Worker for decoding SYNOP.
 * Exports meteoStation() that outputs the final SVG symbol, that can be implemented in wrappers for various web mapping libraries.
 * An example wrapper for Leaflet is provided.
 * 
 */

/* Surface Plotting Model elements (mapping of slot order indices and data elements)

0 (value) = TgTg
1 (value) = TxTxTx or TnTnTn
2 (symbol) = Ch
3 (symbol / value) = E or E'sss (E and E' are symbols, sss is value)
4 (null) = EMPTY

5 (null) = EMPTY
6 (value) = TTT
7 (symbol) = Cm
8 (value) = PPPP/P0P0P0P0 or a3hhh/P0P0P0P0
9 (null) = EMPTY

10 (value) = V V
11 (symbol) = ww/w1w1 or wawa/w1w1
12 (symbol) = N
13 (value) = PPP
14 (symbol) = a

15 (null) = EMPTY
16 (value) = TdTdTd
17 (symbol / value) = Cl (symbol) Nh (value) + h or hh (???)
18 (symbol) = W1W2/w1w1 or Wa1Wa2/w1w1
19 (value) = GG or GGgg

20 (null) = EMPTY
21 (value) = TwTwTw
22 (symbol / value?) = PwaPwaHwaHwa or PwPwHwHw
23 (symbol / value?) = RRR/tR (values) + Ds (arrow symbol) vs (value)
24 (null) = EMPTY

25 (?) = dw1dw1Pw1Pw1Hw1Hw1 + dw2dw2Pw2Pw2Hw2Hw2

*/

export { meteoStation };
import Main_worker from 'web-worker:./main_worker'; // for rollup, so that the worker is included in bundle

let myWorker;
var decodedSynops = [];

// DEBUG flag has to be enabled in the incoming options for meteoStation() - Debug mode shows plotting model background and dashes (-) as unavailable data

// run Pyodide in Web Worker thread (takes ~2.2 sec, still faster by 1.2 sec than inline pyodide + does not block main UI thread +
// + can be kept running in the background and reused for all synop decodings)
if (window.Worker) {    // check if Web Workers are supported in the browser
    myWorker = new Main_worker();
    myWorker.postMessage(document.baseURI)
    myWorker.onmessage = (e) => {
        console.debug("MAIN: Message received back from worker");
        console.debug("MAIN: Data received back from worker:", e.data);
        decodedSynops.push(e.data)

        //myWorker.terminate();
    };
    
    console.debug('MAIN: sent message to worker')
} else {
    console.error('Web Workers are not supported in your browser. Please try again on a browser that supports the Web Workers API: https://developer.mozilla.org/en-US/docs/Web/API/Worker#browser_compatibility')
}

function loadSVGIcon(path) {
    var svg;
    var xhr = new XMLHttpRequest();
    xhr.open("GET",path, false);
    xhr.overrideMimeType("image/svg+xml");
    xhr.onload = function(e) {
        if (xhr.status == 200) {
            svg = xhr.responseXML.documentElement;
        } else {
            svg = null;
        }
    };
    xhr.send(""); 
    return svg;
}

// Function for matching wind speed (either m/s or kt) to the appropriate .svg symbol
// inputs: 
// - speed [float]: wind speed
// - sourceUnit [string]: unit in which speed is given
// output:
// - [int]: matched number in symbol .svg file name

function windSpeedSymbolMatch(speed, sourceUnit) {
    var symbolFileNumber;
    switch (sourceUnit) {
        case "m/s":
            // example 12 ms speed: 12/2.5 = 4.8, rounded up to int 5, therefore symbol *5.svg (that symbol is 5+5+2.5 m/s = 12.5 m/s)
            // example 37.5 ms speed: 37.5/2.5 = 15, no rounding needed, therefore symbol 15.svg (that symbol is 25 [solid pennant] + 5 [long barb] + 5 + 2.5 [half barb] m/s = 37.5 m/s)
            symbolFileNumber = Math.round(speed / 2.5);        
            break;
        case "KT":
            // example 16 kt speed: 16/5 = 3.2, rounded to int 3, therefore symbol *3.svg (that symbol is 10 [long barb] + 5 [half barb] kt = 15 kt, which falls into the interval 13-17 kt, so symbol 03)
            // example 124 kt speed: 16/5 = 24.8, rounded to int 25, therefore symbol 25.svg (that symbol is 50 [solid pennant] + 50 [solid pennant] + 10 [full barb] + 10 [full barb] + 5 [half barb] kt = 125 kt, which falls into the interval 123-127 kt, so symbol *25.svg)
            symbolFileNumber = Math.round(speed / 5); 
            break;
        default:
            console.error('Wind speed unit is unknown!')
            break;
    }
    
    return String(symbolFileNumber).padStart(2, '0');   // example output: 05, to be used in the filename later: "WeatherSymbol_WMO_WindArrowNH_05.svg"
}

async function waitForDecodedSynop(leafletID){

    return new Promise((resolve, reject) => {
        let interval = 20;  // checking interval
        let timeOut = 10000; // waiting time before timeout
        let timer = setInterval(() => {
            timeOut -= interval;
            if (timeOut < 1) {
                clearInterval(timer);
                reject(new Error('catching item timed out'));
            }
            var result = decodedSynops.find(obj => {
                return obj.leafletID === leafletID
            });
            if (result)
                resolve(result);
        }, interval);
    });
}

// create SVG text element for meteorological variables that are plotted as-is (either code number or exact value)
// this function receives processed values - all value processing must happen outside this function, before calling it
function createTextElement(value){
    var textSvg = document.createElementNS("http://www.w3.org/2000/svg", 'text');
    textSvg.innerHTML = value;
    var w = 13.33;
    var h = 13.33;
    textSvg.setAttribute("x", w/2);
    textSvg.setAttribute("y", h/2);
    //textSvg.setAttribute("font-size", "0.8em");
    textSvg.setAttribute("dominant-baseline", "middle");
    textSvg.setAttribute("text-anchor", "middle");

    return textSvg;
}

// consider building SVG symbols multithreaded using Web Workers (will need a dynamic queue-based manager for it tho): 
// https://medium.com/@rijulsarji/web-workers-101-the-ultimate-guide-to-multithreading-in-javascript-63c4ffe20281
// https://medium.com/@sohail_saifi/an-advanced-guide-to-web-workers-in-javascript-for-performance-heavy-tasks-67d27b5c2448

// main function being called for each feature, from Leaflet's ".eachLayer"
// returns the actual generated SVG
async function meteoStation(data, pointCoords, userOptions){

    // default options
    var defaultOptions = {
        scaling: {
            stationModel: 1,
            font: 1
        },
        polyChromatic: true,
        highCloudsInRed: true,
        temperature: "raw",
        dewPoint: "raw",
        elementsToOmit: [],	// e.g. [0, 2, 3, 17, 18]. Any, except 12 (center station circle).
        debug: false
    };
    var appliedOptions = Object.assign(defaultOptions, userOptions);    // override default options with user-defined ones, if any
    var options = appliedOptions;

    var radius = 6;

    // should have 5x5 + 1 (= 26) slots for the whole surface plotting model structure. Content should be a single DOM element object for each slot. 
    // Indices 0, 1, 2, 3, 4 is the first row, 5, 6, 7, 8, 9 is the second row etc. Index 25 should be the "d(w1)d(w1)" bottom one, outside and below the 5x5 grid.
    var plottingModelSlotsContent = new Array(26);

    // generate 26 slot boxes / cells
    for (let i = 0; i < plottingModelSlotsContent.length; i++) {
        if (i == 12) {
            // centered symbol (important for global scaling)
            var centerSvg = document.createElementNS("http://www.w3.org/2000/svg", "g");
            centerSvg.setAttribute("transform-origin", "50% 50%")
            centerSvg.setAttribute("transform", "translate(50% 50%)")
            /*centerSvg.setAttribute("width", 66.6666)
            centerSvg.setAttribute("height", 66.6666)
            centerSvg.setAttribute("x", 16.66)
            centerSvg.setAttribute("y", 16.66)*/
            plottingModelSlotsContent[i] = centerSvg;
        } else {
            var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.setAttribute("transform-origin", "50% 50%")
            if (options.debug) {
                var slotBox = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                slotBox.setAttribute("fill", "none");
                slotBox.setAttribute("stroke", "#00000052");
                slotBox.setAttribute("stroke-dasharray", "2");
                slotBox.setAttribute("width", 13.33);
                slotBox.setAttribute("height", 13.33);
                group.appendChild(slotBox)
            }
            plottingModelSlotsContent[i] = group;
        }
    }
    //console.log(plottingModelSlotsContent)
    

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute('style', 'display: block');    // affects only svgs less than 14x14px in size, otherwise those are misplaced on marker: https://stackoverflow.com/questions/75342672/leaflet-small-divicons-less-than-14px-do-not-align-at-center-of-point
    svg.setAttribute('width', 100);
    svg.setAttribute('height', 100);                // 100x100 canvas for whole symbol
    svg.setAttribute('viewBox', "0 0 100 100");     // 100x100 canvas for whole symbol
    svg.setAttribute('transform', `scale(${options.scaling.stationModel+0.7})`);    // main scaling of whole plotting model symbol (default 1 = 1.7) - option available to end-user
    svg.setAttribute('font-size', `${options.scaling.font-.35}em`);         // main font scaling (default 1 = 0.65em) - option available to end-user
    //fontSize = "0.8em"

    // (debug) include the cell structure template svg as background:    
    /*if (options.debug) {
        // just for debug, insert the base svg grid to ease positioning inside a symbol:
        var baseModel;
        var xhr = new XMLHttpRequest();
        xhr.open("GET","./literature/meteo/surface_plotting_model.svg", false);
        xhr.overrideMimeType("image/svg+xml");
        xhr.onload = function(e) {
            baseModel = xhr.responseXML.documentElement;
        };
        xhr.send("");
        baseModel.setAttribute("opacity", "0.2")
        svg.appendChild(baseModel);
    }*/

    // base offsets for the whole 100x100 canvas
    var x = 16.66;
    var y = 16.66;

    // process SYNOP data
    // send current rawSynop to web worker to decode
    myWorker.postMessage({SYNOP_raw: data.rawSynop, leafletID: data.leafletID});
    var decodedData = await waitForDecodedSynop(data.leafletID);
    decodedData = decodedData.decoded;
    console.debug('decoded SYNOP:', decodedData)
    
    const startTimeAssembly = performance.now();

    // if we have successfully decoded SYNOP, continue:
    if (/*decodedData.length != 0 && */decodedData != null) {
        // build the symbol slot by slot, then plot
        plottingModelSlotsContent.forEach((element, idx) => {
            //console.log(element, idx)

            if (idx != 25) {
                if (idx != 0 && idx % 5 == 0) {
                    // we reached end of row
                    x = 16.66; // reset X coord
                    y += 13.33; // go to next row
                }
                //element.setAttribute("x", x);
                //element.setAttribute("y", y);
                if (idx == 12) {
                    // center slot
                    element.setAttribute("transform", "translate(50, 50)");                 
                } else {
                    element.setAttribute("transform", "translate("+x+", "+y+")");
                }
                svg.appendChild(element)

                // check if user opted to omit current element (slot number). 
                if (options.hasOwnProperty('elementsToOmit') && options.elementsToOmit.includes(idx)) {
                    // Cell 12 can't be omitted (it's the spatial reference)
                    if (idx == 12) {
                        console.warn('Option "elementsToOmit" included cell 12, but it can not be omitted. The central station circle serves as the spatial reference for the symbol. Still plotting it.')
                    } else {
                        console.warn(`Omitting content for user-defined cell number ${idx}.`)
                        x += 13.33; // still proceed to next cell to the right
                        return;
                    }
                } 
                
                switch (idx) {
                    // empty cells, they are defined as empty in WMO reference:
                    case 4:
                    case 5:
                    case 9:
                    case 15:
                    case 20:
                    case 24:
                        break;

                    // TODO CLARIFY: fxfx (wind gust) on the plot? HU PDF plots wind gust m/s value in a circle at the end of the wind shaft, position not clarified (likely at the end of wind shaft)

                    // 2 (CH) - High clouds
                    // can be plotted in red optionally (page A-447)

                    case 2:
                        if (decodedData.cloud_types != null) {
                            if (decodedData.cloud_types.hasOwnProperty("high_cloud_type")
                            && decodedData.cloud_types.high_cloud_type != null
                            && decodedData.cloud_types.high_cloud_type.value != 0) {
                                w = h = 13.33;
                                var icon = loadSVGIcon('./symbols/CH_CloudHigh/WeatherSymbol_WMO_CloudHigh_CH_'+decodedData.cloud_types.high_cloud_type.value+'.svg');
                                if (icon) {
                                    icon.setAttribute("width", w)
                                    icon.setAttribute("height", h)
                                    icon.setAttribute("transform-origin", w/2+" "+h/2)
                                    // optionally red:
                                    if (options.highCloudsInRed) { 
                                        element.setAttribute("style", "filter: brightness(0) saturate(100%) invert(20%) sepia(99%) saturate(5695%) hue-rotate(356deg) brightness(105%) contrast(120%);");}           
                                    element.appendChild(icon)
                                }
                            } else {
                                console.debug('CH high clouds are not defined.')
                            }
                        }
                        break;

                    // 3 (E or E'sss) - Ground cover without (E) or with snow (E'). Total depth of snow (sss) in cm, plotted with 
                    // code figures (CODE TABLE 3889, Volume I.1: A-341) or actual depth, depening on national regs.

                    // TODO CLARIFY + LOGIC: E or E'sss = from SYNOP, how do we know if precip is rain or snow? I need to know that in order to use the correct symbol set E or E'

                    /*
                    case 3:
                        //TODO
                        break;
                    */

                    // 6 (TTT) - Air temperature value

                    // Temp value TTT might be given as 107 (10.7°C). WMO ref says this can either be displayed in the symbol raw as 10.7, or 
                    // rounded to nearest degree as 11. -> a user-facing OPTION, whether to show "tenths" (raw, default) or "rounded" values.
                    // TODO CLARIFY: some sources say this number is to be plotted in RED (WMO ref doesnt).

                    case 6:                    
                        if (decodedData.air_temperature != null) {
                            switch (options.temperature) {
                                case "raw":
                                    // 107 plotted as 10.7
                                    element.appendChild(createTextElement(decodedData.air_temperature.value))
                                    break;
                                case "rounded":
                                    // 107 plotted as 11
                                    element.appendChild(createTextElement(Math.round(decodedData.air_temperature.value)))
                                    break;
                                default:
                                    element.appendChild(createTextElement(decodedData.air_temperature.value))
                                    break;
                            }
                        } else {
                            console.debug('Air Temp is not defined.')
                        }
                        break;

                    // 7 (Cm) - Mid clouds

                    case 7:
                        if (decodedData.cloud_types != null) {
                            if (decodedData.cloud_types.hasOwnProperty("middle_cloud_type")
                            && decodedData.cloud_types.middle_cloud_type != null
                            && decodedData.cloud_types.middle_cloud_type.value != 0) {
                                w = h = 13.33;
                                var icon = loadSVGIcon('./symbols/CM_CloudMedium/WeatherSymbol_WMO_CloudMedium_CM_'+decodedData.cloud_types.middle_cloud_type.value+'.svg');
                                if (icon) {
                                    icon.setAttribute("width", w)
                                    icon.setAttribute("height", h)
                                    icon.setAttribute("transform-origin", w/2+" "+h/2)
                                    element.appendChild(icon)
                                }
                            } else {
                                console.debug('Cm Mid Clouds are not defined.')
                            }
                        }
                        break;

                    // 8 (PPPP / P0P0P0P0 or a3hhh / P0P0P0P0) - Pressure. 
                    // PPPP = air p. at MEAN SEA level. P0P0P0P0 = air p. at STATION level. a3hhh = geopotential of the standard “constant pressure level” 
                    // given by a3 in standard geopotential a3hhh metres omitting the thousands digit

                    // In SYNOP, PPPP=0134 means 1013.4 hPa and 134 is plotted, PPPP=0016 means 1001.6 hPa and 016 is plotted, PPPP=?987 is 998.7 hPa and 987 is plotted.
                    // TODO CLARIFY: what are we plotting here? What are the possible values that are plotted on the symbol? Is P0P0P0P0 optional, and if used, we omit PPPP and a3hhh?
                    // SYNOP has both (3P0P0P0P0) and (4PPPP). 

                    case 8:                    
                        if (decodedData.sea_level_pressure != null) {
                            // this expects raw hPa number currently, converts it to 3 digits to plot (e.g. 1013.4 = 134, 1005 = 050, 992.5 = 925)
                            var processedValue = (decodedData.sea_level_pressure.value % 1 == 0 ? String(decodedData.sea_level_pressure.value+"0").slice(-3) : String(decodedData.sea_level_pressure.value*10).slice(-3).padStart(3, 0))
                            element.appendChild(createTextElement(processedValue))
                        } else {
                            console.debug('Air pressure at sea level (PPPP) is not defined.')
                        }
                        break;

                    // 10 (VV) - Horizontal visibility at surface
                    // value (CODE of visibility)! CODE TABLE 4377 (volume I.1 page A-351)
                    // For codes 00 to 50, this indicates visibility in tenths of a kilometer (hectometers), for example "15" means 1.5 km.
                    // For codes 56 to 80, 50 is subtracted, and the resulting number indicates visibility in kilometers, for example "66" means 16 km.
                    // Codes 81 to 88 indicate visibility in a multiple of 5 km; "81" for 35 km, "88" for 70 km. Code 89 indicates visibility greater than 70 km;
                    // Codes 90 to 99 are used for shipboard observations, from "90" for less than 1⁄16 mile visibility, "95" for 1 mile, "99" for greater than 30 miles.

                    case 10:                    
                        if (decodedData.visibility != null) {
                            element.appendChild(createTextElement(decodedData.visibility._code))
                        } else {
                            console.debug('VV visibility is not defined.')
                        }
                        break;


                    // 11 (ww / w1w1 or ww / wawa) - Present weather
                    // ww - manned station, wawa - automatic station, w1w1 - extension for symbols.

                    // TODO CLARIFY: how is it indicated to use w1w1 extension symbol set?
                    // TODO LOGIC: for symbols ww93 and ww94 there are two alternatives for both (one with * and one with triangles). Page A-443. 
                    // TODO LOGIC: for symbols ww95 and ww97 there are two alternatives for both (one with a dot for rain and one with a * for snow). Page A-443. 
                    // TODO LOGIC: there is a specific case when this slot has to be blank. Page A-443. 
                    // TODO LOGIC: there is a specific case when this slot has to show "//". Page A-443. 

                    case 11:                    
                        if (decodedData.present_weather != null) {
                            w = h = 13.33;
                            if (decodedData.weather_indicator.automatic == true) {
                                // AUTOMATIC station, "wawa" symbol set is used
                                if (decodedData.weather_indicator.value == 5) {
                                    // ix = 5 means weather not significant -> slot left blank (page A-444 note 2/a)
                                } else if (decodedData.weather_indicator.value == 6 || 
                                (decodedData.weather_indicator.value == 7 && !decodedData.hasOwnProperty('present_weather'))) {
                                // (ix = 6) OR (ix = 7 AND no 7-group in message) -> plot "//" (page A-444 note 2/b)
                                    element.appendChild(createTextElement("//"))
                                } else {
                                    // reported present weather seems significant, find symbol
                                    var icon = loadSVGIcon('./symbols/wawa_PresentWeatherAutomaticStation/WeatherSymbol_WMO_PresentWeatherAutomaticStation_wawa_'+String(decodedData.present_weather.value).padStart(2, 0)+'.svg');
                                    if (icon) {
                                        icon.setAttribute("width", w)
                                        icon.setAttribute("height", h)
                                        icon.setAttribute("transform-origin", w/2+" "+h/2)              
                                        icon.setAttribute("transform", "translate(-"+w/10+" 0)")
                                        element.appendChild(icon)
                                    }
                                }
                            } else {
                                // MANNED station, "ww" symbol set is used
                                if (decodedData.weather_indicator.value == 2 || decodedData.weather_indicator.value == 5) {
                                    // if ix = 2 OR 5 -> slot left blank (page A-443 note 2/a)
                                } else if (decodedData.weather_indicator.value == 3 || decodedData.weather_indicator.value == 6 || 
                                    ((decodedData.weather_indicator.value == 1 || decodedData.weather_indicator.value == 4) && !decodedData.hasOwnProperty('present_weather'))) {
                                    // if ix = 3 OR ix = 6 OR ((ix = 1 OR 4) AND no 7-group in message) -> plot "//" (page A-443 note 2/b)
                                    element.appendChild(createTextElement("//"))
                                } else {
                                    var icon = loadSVGIcon('./symbols/ww_PresentWeather/WeatherSymbol_WMO_PresentWeather_ww_'+String(decodedData.present_weather.value).padStart(2, 0)+'.svg');
                                    if (icon) {
                                        icon.setAttribute("width", w)
                                        icon.setAttribute("height", h)
                                        icon.setAttribute("transform-origin", w/2+" "+h/2)                  
                                        icon.setAttribute("transform", "translate(-"+w/10+" 0)")
                                        element.appendChild(icon)
                                    }
                                }                                
                            }
                        } else {
                            console.debug('Present weather (ww in block 7wwW1W2) is not defined.')
                        }
                        break;

                    // 12 (N + ddff) - Sky Cover (oktas) + Automatic station Triangle + Wind direction/speed. Central symbol.

                    case 12:  

                        // SKY COVER symbol    

                        if (decodedData.hasOwnProperty("cloud_cover")) {       
                            if (decodedData.cloud_cover != null) {
                                // OKTA
                                var icon = loadSVGIcon('./symbols/N_TotalCloudCover/WeatherSymbol_WMO_TotalCloudCover_N_'+decodedData.cloud_cover._code+'.svg');
                                if (icon) {
                                    w = h = 13.33;
                                    icon.setAttribute("width", w)
                                    icon.setAttribute("height", h)
                                    icon.setAttribute("transform-origin", w/2+" "+h/2)              
                                    icon.setAttribute("transform", "translate(-"+w/2+" -"+h/2+")")
                                    element.appendChild(icon)
                                }
                            } else {
                                // Slash = NO MEASUREMENTS MADE. In pymetdecoder, this results in an existing, but null "cloud_cover" property.
                                var icon = loadSVGIcon('./symbols/N_TotalCloudCover/WeatherSymbol_WMO_TotalCloudCover_N_Slash.svg');
                                if (icon) {
                                    w = h = 13.33;
                                    icon.setAttribute("width", w)
                                    icon.setAttribute("height", h)
                                    icon.setAttribute("transform-origin", w/2+" "+h/2)              
                                    icon.setAttribute("transform", "translate(-"+w/2+" -"+h/2+")")
                                    element.appendChild(icon)
                                }
                            }
                        } else {
                            console.debug('Sky Cover is not defined (null).')
                        }

                        // AUTOMATIC STATION symbol

                        if (decodedData.hasOwnProperty("weather_indicator")
                            && decodedData.weather_indicator.automatic == 1) {
                            var automaticStationSymbol = loadSVGIcon('./symbols/N_TotalCloudCover/WeatherSymbol_WMO_TotalCloudCover_Automatic.svg');
                            if (automaticStationSymbol) {
                                w = h = 24;
                                automaticStationSymbol.setAttribute("width", w)
                                automaticStationSymbol.setAttribute("height", h)
                                automaticStationSymbol.setAttribute("transform-origin", w/2+" "+h/2)              
                                automaticStationSymbol.setAttribute("transform", "translate(-"+w/2+" -"+((h/2)+2)+")")
                                element.appendChild(automaticStationSymbol)  
                            }                      
                        }

                        // WIND PLOT symbol (direction + speed)

                        if (decodedData.hasOwnProperty("surface_wind") 
                        && decodedData.surface_wind != null
                        && decodedData.surface_wind.hasOwnProperty("direction")
                        && decodedData.surface_wind.direction != null
                        && decodedData.surface_wind.direction.value != null) {
                            // WIND DIRECTION PRESENT
                            if (decodedData.surface_wind.hasOwnProperty("speed")
                                && decodedData.surface_wind.speed != null) {
                                // WIND SPEED NUMBER PRESENT.      
                                var symbolFileNumber = windSpeedSymbolMatch(decodedData.surface_wind.speed.value, decodedData.surface_wind.speed.unit);
                                if (symbolFileNumber == "00" || symbolFileNumber == "01") {
                                    // raw wind speed number was 0 or 1, therefore rounded number was 00 or 01 - WMO does not have a symbol for it (since the lowest wind symbol shows 2.5 m/s / 5 kt), so that is considered calm
                                    // CALM WIND (empty circle shape, around the central station circle)
                                    var icon = loadSVGIcon('./symbols/ddff_WindArrows/WeatherSymbol_WMO_WindArrowCalm_00.svg');
                                    if (icon) {
                                        var w = 25;
                                        var h = 25;
                                        icon.setAttribute("width", w)                       
                                        icon.setAttribute("height", h)         
                                        icon.setAttribute("transform-origin", w/2+" "+h/2)              
                                        icon.setAttribute("transform", "translate(-"+w/2+" -"+h/2+") scale(0.8)")
                                        svg.appendChild(icon)
                                    }
                                } else {
                                    // raw wind speed value seems real
                                    // All pennants and barbs lie to the left of the wind shaft in the northern hemisphere and to the right of the wind shaft in the southern hemisphere.      
                                    
                                    if (pointCoords[1] > 0) {
                                        // NORTHERN HEMISPHERE
                                        var icon = loadSVGIcon('./symbols/ddff_WindArrows/WeatherSymbol_WMO_WindArrowNH_'+symbolFileNumber+'.svg');
                                        if (icon) {
                                            icon.setAttribute("width", 30)
                                            icon.setAttribute("height", 30)
                                            icon.setAttribute("transform-origin", "35.666 18.666")
                                            //icon.setAttribute("style", "transform-box: fill-box")
                                            icon.setAttribute("transform", `translate(-35.66 -18.66) rotate(${decodedData.surface_wind.direction.value + 90})`)     // +90 deg rotation offset is needed due to symbol being positioned to indicate a west wind from 270 deg by default - could be eliminated in the future, with better transformations of subelements
                                        }
                                    } else {
                                        console.debug('SOUTHERN POINT')
                                        // SOUTHERN HEMISPHERE
                                        var icon = loadSVGIcon('./symbols/ddff_WindArrows/WeatherSymbol_WMO_WindArrowSH_'+symbolFileNumber+'.svg');
                                        if (icon) {
                                            icon.setAttribute("width", 30)
                                            icon.setAttribute("height", 30)
                                            icon.setAttribute("transform-origin", "-6.666 18.666")
                                            icon.setAttribute("transform", `translate(6.666 -18.666)`+`rotate(${decodedData.surface_wind.direction.value - 90})`)      // -90 deg rotation offset is needed due to symbol being positioned to indicate an east wind from 90 deg by default - could be eliminated in the future, with better transformations of subelements
                                        }
                                    }
                                }
                            } else {
                                // MISSING WIND SPEED. -> Wind shaft with an "X" at the end
                                var icon = loadSVGIcon('./symbols/ddff_WindArrows/WeatherSymbol_WMO_WindArrowMissing_99.svg');
                                if (icon) {
                                    icon.setAttribute("width", 30)
                                    icon.setAttribute("height", 30)
                                    icon.setAttribute("transform-origin", "36.66 15.66")     
                                    icon.setAttribute("transform", "translate(-36.66 -15.66) "+`rotate(${decodedData.surface_wind.direction.value + 90})`)
                                }
                            }
                            element.appendChild(icon)
                        } else {
                            console.debug('Wind Direction is not defined. Not plotting wind.')
                        }
                        break;

                    // 13 (ppp) - Pressure tendency (value)

                    // Raw SYNOP FORM means tenths of a hPa: the pressure change is plotted in two figures by plotting only the last figures of ppp unless the first figure 
                    // of ppp is other than zero, in which case the pressure change is plotted as reported in three figures. (page A-449). 
                    // So 007 (0.7 hPa) is plotted as 07; 047 (4.7 hPa) is plotted as 47; 099 (9.9 hPa) is plotted as 99; 122 (12.2 hPa) is plotted as 122.
                    // in other words (ELTE HU ref): if hPa value change is <= 9.9 / 3h, plotted number is padded to 2 digits, if more, 3 digits.

                    case 13:
                        if (decodedData.hasOwnProperty('pressure_tendency') 
                            && decodedData.pressure_tendency.hasOwnProperty('change') 
                            && decodedData.pressure_tendency.change != null
                            && decodedData.pressure_tendency.change.value != null) {
                            
                            // correct value processing, into a string:
                            var processedValue = (Math.abs(decodedData.pressure_tendency.change.value) <= 9.9 ? (decodedData.pressure_tendency.change.value < 0 ? '-' + String(Math.abs(decodedData.pressure_tendency.change.value)*10).padStart(2, 0) : String(decodedData.pressure_tendency.change.value*10).padStart(2, 0)) : String(decodedData.pressure_tendency.change.value*10));

                            // value will be red if:
                            // - polychromatic method is enabled, AND
                            // - pressure change is negative (below 0) so is falling (therefore also if a >= 5)
                            // in this case, the preceding minus "-" sign is omitted left of the value
                            if (options.polyChromatic && decodedData.pressure_tendency.change.value < 0) { 
                                element.setAttribute("style", "fill: red;");    // red font
                                processedValue = processedValue.slice(1)        // we are in polychromatic mode, so the preceding "minus" sign shouldnt be shown.
                            }           
                            
                            element.appendChild(createTextElement(processedValue));
                        } else {
                            console.debug('Pressure tendency value (ppp) is not defined.')
                        }
                        break;

                    // 14 (a) - Characteristic pressure tendency (symbol)

                    // TODO CONFIRM: symbol will be red if a >= 5

                    case 14:
                        if (decodedData.hasOwnProperty('pressure_tendency') 
                            && decodedData.pressure_tendency.hasOwnProperty('tendency') 
                            && decodedData.pressure_tendency.tendency != null
                            && decodedData.pressure_tendency.tendency.value != null) {
                            w = h = 13.33;
                            var icon = loadSVGIcon('./symbols/a_PressureTendencyCharacteristic/WeatherSymbol_WMO_PressureTendencyCharacteristic_a_'+decodedData.pressure_tendency.tendency.value+'.svg');
                            if (icon) {
                                icon.setAttribute("width", w)
                                icon.setAttribute("height", h)
                                icon.setAttribute("transform-origin", w/2+" "+h/2)
                                // symbol will be red if:
                                // - polychromatic method is enabled, AND
                                // - a >= 5
                                if (options.polyChromatic && decodedData.pressure_tendency.tendency.value >= 5) { 
                                    element.setAttribute("style", "filter: brightness(0) saturate(100%) invert(20%) sepia(99%) saturate(5695%) hue-rotate(356deg) brightness(105%) contrast(120%);");
                                }           
                                element.appendChild(icon)
                            }
                        } else {
                            console.debug('Characteristic pressure tendency symbol (a) is not defined.')
                        }
                        break;

                    // 16 (TdTdTd) - Dew-point temperature value

                    // TdTdTd might be given as 107 (10.7°C). WMO ref says this can either be displayed raw as 10.7 or 
                    // rounded to nearest degree. -> a user-facing OPTION, whether to show "tenths" (raw, default) or "rounded" values.
                    // TODO CLARIFY: some sources say this number is to be plotted in RED (WMO ref doesnt).

                    case 16:                    
                        if (decodedData.hasOwnProperty("dewpoint_temperature")
                            && decodedData.dewpoint_temperature.value != null) {
                            
                            switch (options.dewPoint) {
                                case "raw":
                                    // 107 plotted as 10.7
                                    element.appendChild(createTextElement(decodedData.dewpoint_temperature.value));
                                    break;
                                case "rounded":
                                    // 107 plotted as 11
                                    element.appendChild(createTextElement(Math.round(decodedData.dewpoint_temperature.value)))
                                    break;
                                default:
                                    element.appendChild(createTextElement(decodedData.dewpoint_temperature.value));
                                    break;
                            }                            
                        } else {
                            console.debug('Dew-point Temp is not defined.')
                        }
                        break;

                    // 17 (ClNh + h or hh)
                    // COMPONENTS:
                    // - Cl, icon symbol: Low cloud type; 
                    // - Nh, value (okta): amount of all low-, if none, mid-clouds present
                    // - h, code value: cloud base height code (code table 1600)
                    // [Cl  Nh]
                    // [      ]
                    // [ h    ]
                    // Cl and Nh next to each other. h is entered below the Cl symbol position!
                    // TODO CLARIFY: what is hh?

                    case 17:
                        if (decodedData.hasOwnProperty("cloud_types")) {
                            w = h = 13.33;
                            if (decodedData.cloud_types.hasOwnProperty("low_cloud_type")
                            && decodedData.cloud_types.low_cloud_type != null
                            && decodedData.cloud_types.low_cloud_type.hasOwnProperty("value")
                            && decodedData.cloud_types.low_cloud_type.value != null) {

                                if (decodedData.cloud_types.low_cloud_type.value == 0) {
                                    // THIS IS THE CASE OF Nh SHOWING THE MID CLOUD AMOUNT okta, when no low cloud amount is known!
                                    // TODO CLARIFY: in this case, no Cl icon symbol is shown?
                                    // result in this case, Nh of mid clouds:
                                    // [    Nh]
                                    // [      ]
                                    // [ h    ]

                                    if (decodedData.cloud_types.hasOwnProperty("middle_cloud_amount")
                                    && decodedData.cloud_types.middle_cloud_amount.value != null) {
                                        //w = h = 13.33;
                                        var Nh_value_SVG = createTextElement(decodedData.cloud_types.middle_cloud_amount.value);
                                        Nh_value_SVG.setAttribute("transform-origin", w/2+" "+h/2)       
                                        Nh_value_SVG.setAttribute("transform", "translate("+w/3.2+" -"+w/5+")");    // shift +X -Y from slot center
                                        element.appendChild(Nh_value_SVG)
                                        //w = h = 13.33;
                                        var h_value_SVG = createTextElement(decodedData.lowest_cloud_base._code);
                                        h_value_SVG.setAttribute("transform-origin", w/2+" "+h/2)       
                                        h_value_SVG.setAttribute("transform", "translate(-"+w/3.2+" "+w/2.6+")");    // shift -X +Y from slot center (downwards, under Cl symbol) 
                                        element.appendChild(h_value_SVG)

                                    }

                                } else {
                                    // Nh amount will be that of low clouds, normally, because low clouds amount is present (okta)

                                    if (decodedData.cloud_types.hasOwnProperty("low_cloud_amount")
                                    && decodedData.cloud_types.low_cloud_amount.value != null) {
                                        // Nh is given, so we will have TWO things next to each other at the TOP row of slot: Cl icon symbol and Nh value (okta)
                                        if (decodedData.hasOwnProperty("lowest_cloud_base")
                                        && decodedData.lowest_cloud_base._code != null) {
                                            // h is also given, so the ClNh pair has to be shifted upwards, h has to be shifted downwards and left (to center it under Cl symbol)
                                            // result in this case:
                                            // [Cl  Nh]
                                            // [      ]
                                            // [ h    ]
                                            var icon = loadSVGIcon('./symbols/CL_CloudLow/WeatherSymbol_WMO_CloudLow_CL_'+decodedData.cloud_types.low_cloud_type.value+'.svg');
                                            if (icon) {
                                                icon.setAttribute("width", w);
                                                icon.setAttribute("height", h);
                                                icon.setAttribute("transform-origin", w/2+" "+h/2);
                                                icon.setAttribute("transform", "translate(-"+w/3.2+" -"+w/3.2+")");   // shift -X -Y from slot center 
                                                element.appendChild(icon);
                                            }
                                            //w = h = 13.33;
                                            var Nh_value_SVG = createTextElement(decodedData.cloud_types.low_cloud_amount.value);
                                            Nh_value_SVG.setAttribute("transform-origin", w/2+" "+h/2)       
                                            Nh_value_SVG.setAttribute("transform", "translate("+w/3.2+" -"+w/5+")");    // shift +X -Y from slot center
                                            element.appendChild(Nh_value_SVG)
                                            //w = h = 13.33;
                                            var h_value_SVG = createTextElement(decodedData.lowest_cloud_base._code);
                                            h_value_SVG.setAttribute("transform-origin", w/2+" "+h/2)       
                                            h_value_SVG.setAttribute("transform", "translate(-"+w/3.2+" "+w/2.6+")");    // shift -X +Y from slot center (downwards, under Cl symbol) 
                                            element.appendChild(h_value_SVG)
                                        } else {
                                            // h is not given. ClNh are next to each other, centered vertically (no need to shift upwards).
                                            // result in this case:
                                            // [      ]
                                            // [Cl  Nh]
                                            // [      ]
                                            var icon = loadSVGIcon('./symbols/CL_CloudLow/WeatherSymbol_WMO_CloudLow_CL_'+decodedData.cloud_types.low_cloud_type.value+'.svg');
                                            if (icon) {
                                                icon.setAttribute("width", w);
                                                icon.setAttribute("height", h);
                                                icon.setAttribute("transform-origin", w/2+" "+h/2);
                                                icon.setAttribute("transform", "translate(-"+w/3.2+" 0)");   // shift -X from slot center 
                                                element.appendChild(icon);
                                            }
                                            w = h = 13.33;
                                            var Nh_value_SVG = createTextElement(decodedData.cloud_types.low_cloud_amount.value);
                                            Nh_value_SVG.setAttribute("transform-origin", w/2+" "+h/2)       
                                            Nh_value_SVG.setAttribute("transform", "translate("+w/3.2+" 0)");    // shift +X from slot center   
                                            element.appendChild(Nh_value_SVG)
                                        }                            
                                    } else {
                                        // there is no Nh, no need to shift on X axis at all.
                                        if (decodedData.hasOwnProperty("lowest_cloud_base")
                                        && decodedData.lowest_cloud_base._code != null) {
                                            // h is given, it should be under Cl symbol -> shift symbol upwards, shift h value downwards (inside slot)
                                            // result in this case:
                                            // [ Cl ]
                                            // [    ]
                                            // [  h ]
                                            var icon = loadSVGIcon('./symbols/CL_CloudLow/WeatherSymbol_WMO_CloudLow_CL_'+decodedData.cloud_types.low_cloud_type.value+'.svg');
                                            if (icon) {
                                                icon.setAttribute("width", w)
                                                icon.setAttribute("height", h)
                                                icon.setAttribute("transform-origin", w/2+" "+h/2)
                                                icon.setAttribute("transform", "translate(0 -"+w/3.2+")");    // shift -Y from slot center (upwards)
                                                element.appendChild(icon)
                                            }
                                            w = h = 13.33;
                                            var h_value_SVG = createTextElement(decodedData.lowest_cloud_base._code);
                                            h_value_SVG.setAttribute("transform-origin", w/2+" "+h/2)       
                                            h_value_SVG.setAttribute("transform", "translate(0 "+w/3.2+")");    // shift +Y from slot center (downwards) 
                                            element.appendChild(h_value_SVG)
                                        } else {
                                            // h is also missing, so Cl symbol will be solo, centered in slot
                                            // result in this case:
                                            // [    ]
                                            // [ Cl ]
                                            // [    ]
                                            var icon = loadSVGIcon('./symbols/CL_CloudLow/WeatherSymbol_WMO_CloudLow_CL_'+decodedData.cloud_types.low_cloud_type.value+'.svg');
                                            if (icon) {
                                                icon.setAttribute("width", w)
                                                icon.setAttribute("height", h)
                                                icon.setAttribute("transform-origin", w/2+" "+h/2)
                                                element.appendChild(icon)
                                            }
                                        }
                                    }
                                }
                                
                            } else {
                                console.debug('Low clouds data (Cl) is not defined.')
                            }
                        } else {
                            console.debug('No cloud types property. Cell 17 left empty.')
                        }
                        break;
                        
                    // 18 (W1W2/w1w1 or Wa1Wa2/w1w1) - Past weather

                    // W1W2 - manned station, Wa1Wa2 - automatic station, w1w1 - extension for symbols.
                    // from SYNOP block 7wwW1W2.
                    // This CAN be TWO SYMBOLS! W1 represents the weather occurring in the earlier part of the 6-hour period, while W2 represents the later part. Sometimes only W1 is given.
                    // example for SYNOP 7wwW1W2 in case of manned: 70589: ww = 05 = Haze, W1 = 8 = Showers, W2 = 9 = Thunderstorms. In this case, we went from showers -> thunderstorm -> haze.

                    // TODO LOGIC: there is a specific case when this slot has to be blank. Page A-443. 
                    // TODO LOGIC: there is a specific case when this slot has to show "//". Page A-443. 
                    // TODO LOGIC: for symbol Wa1Wa2-7 there are two alternatives (one with * and one with a triangle). Page A-446. 
                    // TODO LOGIC: for symbol W1W2-3 there are two alternatives (one is sandstorm, other snowstorm). Page A-446. 

                    case 18:
                        if (decodedData.hasOwnProperty("past_weather")) {
                            if (decodedData.past_weather[0] != null || decodedData.past_weather[1] != null) {
                                // we have a data for either W1 or W2
                                w = h = 13.33;
                                if (decodedData.weather_indicator.automatic == 1) {
                                    // AUTOMATIC station, so Wa1Wa2 symbol set is used
                                    if (decodedData.past_weather[1] != null && decodedData.past_weather[1].value != null) {
                                        // W2 is given, therefore we will have TWO symbols next to each other (W1W2). This is only important for the positioning.
                                        // W1 (left)
                                        var icon1 = loadSVGIcon('./symbols/Wa1Wa2_PastWeatherAutomaticStation/WeatherSymbol_WMO_PastWeatherAutomaticStation_Wa1Wa1_'+decodedData.past_weather[0].value+'.svg');
                                        if (icon1) {
                                            icon1.setAttribute("width", w);
                                            icon1.setAttribute("height", h);
                                            icon1.setAttribute("transform-origin", w/2+" "+h/2);
                                            icon1.setAttribute("transform", "translate(-"+w/3.2+" 0)");   // shift -X from slot center 
                                            element.appendChild(icon1);
                                        }
                                        // W2 (right)
                                        var icon2 = loadSVGIcon('./symbols/Wa1Wa2_PastWeatherAutomaticStation/WeatherSymbol_WMO_PastWeatherAutomaticStation_Wa1Wa1_'+decodedData.past_weather[1].value+'.svg');
                                        if (icon2) {
                                            icon2.setAttribute("width", w)
                                            icon2.setAttribute("height", h)
                                            icon2.setAttribute("transform-origin", w/2+" "+h/2)       
                                            icon2.setAttribute("transform", "translate("+w/3.2+" 0)");    // shift +X from slot center   
                                            element.appendChild(icon2);
                                        }
                                    } else {
                                        // only W1 is given, we plot that symbol centered as usual
                                        var icon = loadSVGIcon('./symbols/Wa1Wa2_PastWeatherAutomaticStation/WeatherSymbol_WMO_PastWeatherAutomaticStation_Wa1Wa1_'+decodedData.past_weather[0].value+'.svg');
                                        if (icon) {
                                            icon.setAttribute("width", w)
                                            icon.setAttribute("height", h)
                                            icon.setAttribute("transform-origin", w/2+" "+h/2)              
                                            element.appendChild(icon)
                                        }
                                    }                            
                                } else {
                                    // MANNED station, so W1W2 symbol set is used. In polychromatic method, these are RED. Page A-446.
                                    // past weather codes 0, 1, 2 are not plotted. Source: https://www.wpc.ncep.noaa.gov/dailywxmap/plottedwx.html
                                    if (decodedData.past_weather[1] != null
                                        && decodedData.past_weather[1].value != null
                                        && decodedData.past_weather[1].value != 0
                                        && decodedData.past_weather[1].value != 1
                                        && decodedData.past_weather[1].value != 2) {
                                        // W2 is given, therefore we will have TWO symbols next to each other (W1W2)
                                        (decodedData.past_weather[0].value == 3 ? decodedData.past_weather[0].value = "3a" : "");    // DELETE THIS LATER, JUST A DEBUG WORKAROUND FOR NOW FOR 3A/3B.
                                        // W1 (left)
                                        var icon1 = loadSVGIcon('./symbols/W1W2_PastWeather/WeatherSymbol_WMO_PastWeather_W1W2_'+decodedData.past_weather[0].value+'.svg');
                                        if (icon1) {
                                            icon1.setAttribute("width", w);
                                            icon1.setAttribute("height", h);
                                            icon1.setAttribute("transform-origin", w/2+" "+h/2);
                                            icon1.setAttribute("transform", "translate(-"+w/3.8+" 0)");   // shift -X from slot center 
                                            element.appendChild(icon1);
                                            (decodedData.past_weather[1].value == 3 ? decodedData.past_weather[1].value = "3a" : "");    // DELETE THIS LATER, JUST A DEBUG WORKAROUND FOR NOW FOR 3A/3B.
                                        }
                                        // W2 (right)
                                        var icon2 = loadSVGIcon('./symbols/W1W2_PastWeather/WeatherSymbol_WMO_PastWeather_W1W2_'+decodedData.past_weather[1].value+'.svg');
                                        if (icon2) {
                                            icon2.setAttribute("width", w)
                                            icon2.setAttribute("height", h)
                                            icon2.setAttribute("transform-origin", w/2+" "+h/2)       
                                            icon2.setAttribute("transform", "translate("+w/2.2+" 0)");    // shift +X from slot center  
                                            // polychromatic method: make symbol red
                                            if (options.polyChromatic) { element.setAttribute("style", "filter: brightness(0) saturate(100%) invert(20%) sepia(99%) saturate(5695%) hue-rotate(356deg) brightness(105%) contrast(120%);");}        
                                            element.appendChild(icon2);
                                        }
                                    } else {
                                        // we only have W1 info
                                        if (decodedData.past_weather[0] != null
                                        && decodedData.past_weather[0].value != null
                                        && decodedData.past_weather[0].value != 0
                                        && decodedData.past_weather[0].value != 1
                                        && decodedData.past_weather[0].value != 2) {
                                            // only W1 is given, we plot that symbol centered as usual
                                            (decodedData.past_weather[0].value == 3 ? decodedData.past_weather[0].value = "3a" : "");    // DELETE THIS LATER, JUST A DEBUG WORKAROUND FOR NOW FOR 3A/3B.
                                            var icon = loadSVGIcon('./symbols/W1W2_PastWeather/WeatherSymbol_WMO_PastWeather_W1W2_'+decodedData.past_weather[0].value+'.svg');
                                            if (icon) {
                                                icon.setAttribute("width", w)
                                                icon.setAttribute("height", h)
                                                icon.setAttribute("transform-origin", w/2+" "+h/2)    
                                                // polychromatic method: make symbol red
                                                if (options.polyChromatic) { element.setAttribute("style", "filter: brightness(0) saturate(100%) invert(20%) sepia(99%) saturate(5695%) hue-rotate(356deg) brightness(105%) contrast(120%);");}           
                                                element.appendChild(icon)
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            console.debug('Past weather (W1W2 in block 7wwW1W2) is not defined.')
                        }
                        break;

                    // 23 (RRR/tR) - Precipitation
                    // RRR: CODE TABLE 3590. Precipitation amount.
                    // tR: CODE TABLE 4019. Length of time covered (6-12-18-24h). CODE is plotted!! 
                    // tR codes 1-4 are 6, 12, 18, 24 hours preceding the obs. Plotted/expressed in units of six hours! So: (code 1-4) * 6 = the number of actual hours.
                    // tR codes 5-9 are 1, 2, 3, 9, 15 hours preceding the obs.

                    case 23:
                        if (decodedData.hasOwnProperty("precipitation_indicator")) {
                            w = h = 13.33;
                            if (decodedData.precipitation_indicator.value == 3) {
                                // A-450 page, RRR scenario b): precip amount is zero (iR = 3), RRR is not plotted on map. Do nothing.
                            } else if (decodedData.precipitation_indicator.value == 4){
                                // A-450 page, RRR scenario c): no precip observation was made (iR = 4), RRR plotted as "///"
                                element.appendChild(createTextElement("///"));
                            } else {
                                // A-449 page, RRR scenario a): precip amount reported (iR = 1 or 2), RRR is plotted on map.
                                if (decodedData.hasOwnProperty("precipitation_s1") || decodedData.hasOwnProperty("precipitation_s3")) {
                                    var precipAmount;
                                    var precipTimeBeforeObs;

                                    // loop through the properties of the "precipitation_indicator" property (it has "in_group_1" and "in_group_3", which should be checked)
                                    for (let [indicator, value] of Object.entries(decodedData.precipitation_indicator)) {
                                        if (indicator == "in_group_1" && value == true) {
                                            precipAmount = decodedData.precipitation_s1.amount.value
                                            precipTimeBeforeObs = decodedData.precipitation_s1.time_before_obs._code    // code is plotted! Page A-450.
                                        } else if (indicator == "in_group_3" && value == true) {
                                            precipAmount = decodedData.precipitation_s3.amount.value
                                            precipTimeBeforeObs = decodedData.precipitation_s3.time_before_obs._code
                                        }
                                    }
                                    
                                    var finalAmount = precipAmount;

                                    // if its between 0 and 1, drop the whole 0 (for example 0.7 becomes .7 on plot)
                                    if (0 < precipAmount && precipAmount < 1) {
                                        finalAmount = precipAmount.toString().substring(1)
                                    }

                                    // if we have timeBeforeObs available, shift the value -X, show timeBeforeObs right of it +X shifted
                                    if (precipTimeBeforeObs != null) {
                                        var finalAmount_SVG = createTextElement(finalAmount);
                                        finalAmount_SVG.setAttribute("transform-origin", w/2+" "+h/2)       
                                        finalAmount_SVG.setAttribute("transform", "translate(-"+w/4.2+" 0)");    // shift -X
                                        element.appendChild(finalAmount_SVG)

                                        var finalPrecipTimeBeforeObs_SVG = createTextElement(precipTimeBeforeObs);
                                        finalPrecipTimeBeforeObs_SVG.setAttribute("transform-origin", w/2+" "+h/2)       
                                        finalPrecipTimeBeforeObs_SVG.setAttribute("transform", "translate("+w/3+" 0)");    // shift +X
                                        element.appendChild(finalPrecipTimeBeforeObs_SVG)
                                    } else {
                                        element.appendChild(createTextElement(finalAmount));
                                    }
                                }
                            }                        
                        } else {
                            console.debug('RRR Precipitation property is not defined.')
                        }
                        break;


                    // unhandled, for debug only:
                    default:
                        if (options.debug) {   
                            element.appendChild(createTextElement("x"));
                        }
                        break;
                }

                x += 13.33; // go to next cell to the right
            } else {
                // bottom special slot "d(w1)d(w1)..."
                // TODO
            }
        });
        
    }
    
/*
    svg.appendChild(circleSkyCover);*/

    const endTimeAssembly = performance.now();
    console.debug(`Symbol assembly took: ${Math.round(endTimeAssembly - startTimeAssembly)} ms`)

    return svg;
}
