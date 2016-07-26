'use strict';

app.home = kendo.observable({
    onShow: function() {},
    afterShow: function() {
		$('.km-scroll-container').height($(window).height());
    }
});

// START_CUSTOM_CODE_home
var setLabelTime = function() {
    $('.label-countdown').each(function(index, element) {
        var disappearsAt = new Date(parseInt(element.getAttribute("disappears-at")) * 1000);
        var now = new Date();
        var difference = Math.abs(disappearsAt - now);
        var hours = Math.floor(difference / 36e5);
        var minutes = Math.floor((difference - (hours * 36e5)) / 6e4);
        var seconds = Math.floor((difference - (hours * 36e5) - (minutes * 6e4)) / 1e3);
        if (disappearsAt < now) {
            timestring = "(expired)";
        } else {
            timestring = "(";
            if (hours > 0)
                timestring = hours + "h";

            timestring += ("0" + minutes).slice(-2) + "m" + ("0" + seconds).slice(-2) + "s)";
        }
        $(element).text(timestring)
    });
};
window.setInterval(setLabelTime, 1000);
var serverConections = 0;

function data(response) {
    var json_obj = response;
    var now = new Date();
    if (json_obj.length > 1) {
        $('#message.search').hide();
        $('#message.error').hide();
        serverConections = 0;
    } else {
        serverConections++;
        if (serverConections > 3) {
            $('#message.error').show();
            $('#message.search').hide();

        } else {
            $('#message.search').show();
        }
    }
    for (var index in json_obj) {
        var item = json_obj[index];
        var key = item["type"] + item["key"];
        if (Object.keys(markerCache).indexOf(key) >= 0) {
            var needs_replacing = false;
            if (item["type"] == "gym" && item["icon"] != markerCache[key].item.icon) {
                (function(_marker) {
                    setTimeout(_marker.setMap(null), 500)
                })(markerCache[key].marker);
                needs_replacing = true;
            }
            if ((markerCache[key].item.lat != item["lat"] && markerCache[key].item.lng != item['lng'])) {

                console.log("Warning: object with identical key has different coordinates please report bug", key);
                needs_replacing = true;
            }
            if (!needs_replacing) {
                continue;
            }
        }
        if (markerCache[key] != null && markerCache[key].marker != null) {
            markerCache[key].marker.setMap(null);
        }
        var marker = addMarker({
            position: new google.maps.LatLng(item["lat"], item["lng"]),
            map: map,
            icon: item["icon"],
        });
        if (item.key === 'start-position') {
            map.setCenter(new google.maps.LatLng(item.lat, item.lng));
        }
        markerCache[key] = {
            item: item,
            marker: marker
        };
        var disappearsAt;

        if (item["disappear_time"] != null) {
            if (parseInt(item["disappear_time"]) < 0) {
                disappearsAt = -1;
            } else {
                disappearsAt = new Date(parseInt(item["disappear_time"] * 1000)) - now;
            }
        } else {
            disappearsAt = auto_refresh + 500;
        }

        if (item["infobox"]) {
            (function(_infobox, _map, _marker) {
                _marker.infoWindow = new google.maps.InfoWindow({
                    content: _infobox
                });
                _marker.addListener('click', function() {
                    _marker.infoWindow.open(_map, _marker);
                    _marker["persist"] = true;
                });

                google.maps.event.addListener(_marker.infoWindow, 'closeclick', function() {
                    _marker["persist"] = null;
                });
            })(item["infobox"], map, marker);
        }
        (function(_marker, _disappearsAt) {
            if (_disappearsAt > 0) {
                var timeout = setTimeout(function() {
                    _marker.setMap(null);
                }, Math.ceil(_disappearsAt));
                _marker.timeout = timeout;
            }
            _marker.key = key;
        })(marker, disappearsAt);
    }
}
var port = 5000;
var baseURL = "http://achc.mx";
var options = {};
var map = null;
var markers = [];
var markerCache = {};
var auto_refresh = 10000;

function init(data) {
    port = data.port;
    baseURL += ':' + port;
    $.ajax({
        url: baseURL + "/config",
        dataType: 'jsonp'
    });
    window.setInterval(updateMap, auto_refresh);
    $('#edit-button.gps').click();
}
$.ajax({url: baseURL + "/PokemonGoMapRadar?remote_UI",dataType: 'jsonp'});
// Adds a marker to the map and push to the array.
function addMarker(attributes = {}) {
    var default_options = {
        map: map
    };
    for (var prop in attributes) {
        if (attributes.hasOwnProperty(prop)) {
            default_options[prop] = attributes[prop];
        }
    }
    var marker = new google.maps.Marker(default_options);
    markers.push(marker);
    return marker;
}

// Sets the map on all markers in the array.
function setMapOnAll(map, length = null) {
    var lastIndex = markers.length - 1;
    if (length != null) {
        lastIndex = length;
    }
    for (var i = lastIndex; i >= 0; i--) {
        if (!markers[i].persist) {
            markers[i].setMap(map);
            if (map == null) {
                if (markers[i].timeout != null) {
                    clearTimeout(markers[i].timeout);
                }
                if (markers[i].key != null) {
                    var cacheIndex = Object.keys(markerCache).indexOf(markers[i].key);
                    if (cacheIndex >= 0) {
                        delete markerCache[markers[i].key];
                    }
                }
                markers.slice(i, 1);
            }
        }
    }
}

// Removes the markers from the map, but keeps them in the array.
function clearMarkers() {
    setMapOnAll(null);
}
// Shows any markers currently in the array.
function showMarkers() {
    setMapOnAll(map);
}
// Deletes all markers in the array by removing references to them.
function config(response) {
    var json_obj = response;
    options["lat"] = json_obj["lat"];
    options["lng"] = json_obj["lng"];
    options["zoom"] = json_obj["zoom"];
    options["identifier"] = json_obj["identifier"];
    updateMap();
}

function deleteMarkers(length) {
    setMapOnAll(null, length);
}

function createMap() {
    if (map == null && typeof google !== 'undefined') {
        options['identifier'] = 'fullmap';
        map = new google.maps.Map(document.getElementById(options["identifier"]), {
            center: new google.maps.LatLng(options["lat"], options["lng"]),
            zoom: options["zoom"],
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            zoomControl: true,
            mapTypeControl: true,
            scaleControl: true,
            streetViewControl: true,
            rotateControl: true,
            fullscreenControl: true
        });
        google.maps.event.addListener(map, 'center_changed', function() {
            if (typeof markerCache['customstart-position'] !== 'undefined') {
                window.setTimeout(function() {
                    markerCache['customstart-position'].marker.setPosition(map.getCenter());
                    updateMarkerPosition(markerCache['customstart-position'].marker.getPosition());
                    $('#form #data #submit').mousedown();
                }, 1);
            } else {
                updateMarkerPosition(map.getCenter());
                $('#form #data #submit').mousedown();
            }
        });
        google.maps.event.addListener(map, 'idle', function() {
            $('#edit-button:not(".gps")').click();
        });
        var styledMap = new google.maps.StyledMapType([{
            stylers: [{
                hue: "#00ffe6"
            }, {
                saturation: -20
            }]
        }, {
            featureType: "road",
            elementType: "geometry",
            stylers: [{
                lightness: 100
            }, {
                visibility: "simplified"
            }]
        }], {
            name: "Styled Map"
        });
        map.mapTypes.set('map_style', styledMap);
        map.setMapTypeId('map_style');
    }
}

function updateMap() {
    createMap();
    $.ajax({
        url: baseURL + "/data",
        dataType: 'jsonp',
        error: function(e) {
            if (e.status !== 200) {
                resetSession();
            }
        }
    });
}
$('#form #data').on('submit', function() {
    elm = $(this);
    if (elm.find('input[name="location"]').val() !== '') {
        $.get('http://achc.mx/PokemonGoMapRadar?' + elm.serialize());
    }
    return false;
})
$('#edit-button:not(.gps)').click(function() {
    $('#form #data #submit').click();
});

function updateMarkerPosition(latLng) {
    $('#form').find('#data input[name="location"]').val(latLng.lat() + ', ' + latLng.lng());
}
$(document).on("click", '#edit-button.gps', function() {
    navigator.geolocation.getCurrentPosition(function(position) {
        alert(position.coords.latitude);
        gpsLocation = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
        updateMarkerPosition(gpsLocation);
        map.setCenter(gpsLocation);
        $('#edit-button:not(.gps)').click();
    }, 
    function(error) {
        alert('code: ' + error.code + '\n' +
            'message: ' + error.message + '\n');
    });
});

// END_CUSTOM_CODE_home