import webWorkerLoader from 'rollup-plugin-web-worker-loader';  // needed for bundling the web worker code. Looks for prefix "web-worker://" in imports (see main.js)
import { nodeResolve } from '@rollup/plugin-node-resolve'; // needed for bundling OL when it was installed as npm package for dev

export default {
    input: './src/wrapper_Leaflet.js',
    plugins: [
        nodeResolve(),
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