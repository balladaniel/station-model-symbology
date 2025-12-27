/**
 * Wrapper for Leaflet, for module "station-model-symbology"
 * 
 * Extends L.GeoJSON. Imports main.js of the module. Supports Leaflet v1.9.4.
 */

import { meteoStation } from "./main.js";
//const meteoStation = require("./main.js");

L.StationModels = L.GeoJSON.extend({

    _main() {
        var options = this.options; // user-defined options on L.geoJSON() instantiation

        this.eachLayer(function(layer) {

            // check if user-defined attribute in GeoJSON exists
            if (!layer.feature.properties.hasOwnProperty(options.field)) {
                console.error('Attribute field "'+options.field+'" does not exist in given GeoJSON. Please note that attribute field input is case-sensitve. Available attribute fields: '+JSON.stringify(layer.feature.properties));
                return;

                // later, apply some default symbol for feature, indicating missing SYNOP report (instead of the Leaflet default blue pin)
            } 

            // check if user-defined attribute in GeoJSON has value
            if (layer.feature.properties[options.field] == "") {
                console.error('Attribute field "'+options.field+'" exists, but for this feature, has an empty string.');
                return;

                // later, apply some default symbol for feature, indicating missing SYNOP report (instead of the Leaflet default blue pin)
            } 

            meteoStation(
                {
                    rawSynop: layer.feature.properties[options.field],
                    leafletID: layer._leaflet_id    // Leaflet feature ID is kept, so the symbol can be applied to the proper feature
                }, 
                layer.feature.geometry.coordinates, // lat/lon coords are needed for compliant wind shaft (depending on hemishpere)
                options // user-options forwarded directly to the main staton model symbol generator module
            )
            .then((finalSymbol) => {
                var iconW = finalSymbol.getAttribute('width');
                var iconH = finalSymbol.getAttribute('height');

                const svgIcon = L.divIcon({
                    html: finalSymbol,
                    className: "",
                    iconSize: [iconW, iconH],
                    iconAnchor: [iconW/2, iconH/2],
                });           

                layer.setIcon(svgIcon);
            });
        });
    },

    onAdd(map) {
        console.debug('L.stationModels: Added...')
        console.debug('L.stationModels: user-defined options:', this.options)
        L.GeoJSON.prototype.onAdd.call(this, map);
        this._main(map);
    },
});

L.stationModels = function (layers, options) {
	return new L.StationModels(layers, options);
};