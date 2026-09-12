/**
 * Wrapper for "station-model-symbology" for use in OpenLayers
 * 
 * Imports main.js of the module. Tested with OpenLayers v10.9.0.
 */

import { meteoStation } from "./main.js";
//const meteoStation = require("./main.js");

import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Style from 'ol/style/Style.js';
import Icon from 'ol/style/Icon.js';
import {useGeographic} from 'ol/proj.js';

ol.StationModels = function(data, options) {

    /* 
        useGeographic():
        Calling it to ensure point coordinates are in EPSG:4326 by default. 
        NOTE: this does alter the whole map, so if there are other layers expecting default behaviour, this needs to be handled differently.
        Alternative method: 
        - do not call useGeographic(),
        - when initializing GeoJSON(), use options {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'}
        - then, the coordinates used in the style function would need to be transformed to 4326, using {transform} from "ol/proj"
        Obviously, that is a step to avoid, as it will perform an extra transformation for every feature and their coordinates, producing approximate lat/lon coords.
        https://openlayers.org/en/latest/apidoc/module-ol_proj.html#.useGeographic
    */
    useGeographic();    

    // ensure defaults (since the scaling changes in module v1.1)
    if (!options.hasOwnProperty('scaling')) {
        options.scaling = {
            stationModel: 1,
            font: 1
        };
    } else {
        if (!options.scaling.hasOwnProperty('stationModel')) {
            options.scaling.stationModel = 1;
        }
        if (!options.scaling.hasOwnProperty('font')) {
            options.scaling.font = 1;
        }
    }

    if (!options.hasOwnProperty('attribution')) {
        console.warn('Attribution is missing for the StationModels layer. Please provide it as option `attribution`.')
        options.attribution = ""; // so that "undefined" does not appear in the attribution panel of OL
    }

    const vectorLayer = new VectorLayer({
        source: new VectorSource({
            features: new GeoJSON(/*{dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'}*/).readFeatures(data),
            attributions: String(options.attribution)
        }),
        //style: styleFunction,
        style: null // removes the default marker for point geometries in OpenLayers, so they dont pop up before the station model symbol is applied
    });

    vectorLayer.getSource().forEachFeature(function (feature) {
        console.debug('OL FEATURE', feature);

        var style;
        var coords = feature.getGeometry().getCoordinates(); // [lon, lat]
        var fattributes = feature.getProperties(); // ol function for retrieving just the feature attributes

        //meteoStation({rawSynop: xxx, leafletID: xxx}, pointCoords, userOptions)
        meteoStation({
            rawSynop: fattributes.synop, 
            leafletID: parseInt(feature.ol_uid)
        }, 
        coords,
        options).then((finalSymbol) => {
            console.debug(`Feature ${parseInt(feature.ol_uid)}: FINALSYMBOL:`, finalSymbol)
            var iconW = finalSymbol.getAttribute('width');
            var iconH = finalSymbol.getAttribute('height');
            //console.debug(`${finalSymbol.outerHTML}`)
            style = new Style({
                image: new Icon({
                    opacity: 1,
                    scale: 0.7 + options.scaling.stationModel,  // adding 0.7 to scaling just ensures a good default for scaling the final SVG to be displayed in OpenLayers
                    rotateWithView: true,

                    // working yellow circle if needed for debug:
                    //src: `data:image/svg+xml;utf8,<svg width="120" height="120" version="1.1" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="60" r="30" fill="yellow"/></svg>`,

                    // station model symbol:
                    src: `data:image/svg+xml;utf8,${escape(finalSymbol.outerHTML)}`
                })
            })
            feature.setStyle(style)
        })
        //return style;
    });

    /*vectorLayer2.setStyle(function(feature) {

        
    })*/
    
    return vectorLayer;
}

ol.stationModels = function (data, options) {
	return new ol.StationModels(data, options);
};
