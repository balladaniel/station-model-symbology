import webWorkerLoader from 'rollup-plugin-web-worker-loader';  // needed for bundling the web worker code. Looks for prefix "web-worker://" in imports (see main.js)

export default {
    input: './src/wrapper_Leaflet.js',
    plugins: [
        webWorkerLoader(/* rollup-plugin-web-worker-loader plugin config, if needed */)
    ],
    output: [{
        file: './dist/station-model-symbology-Leaflet-UMD.js',
        format: 'umd',
        name: 'station-model-symbology'
    }, {
        file: './dist/station-model-symbology-Leaflet-IIFE.js',
        format: 'iife'
    }]
}