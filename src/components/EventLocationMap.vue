<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = defineProps({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  title: { type: String, default: '' },
  address: { type: String, default: '' },
  userLatitude: { type: Number, default: null },
  userLongitude: { type: Number, default: null },
})

const MAP_ZOOM = 16

const mapRoot = ref(null)
let map = null
let eventMarker = null
let userMarker = null

function createMarkerIcon(kind = 'event') {
  const dotClass = kind === 'user' ? 'event-map-marker__dot--user' : 'event-map-marker__dot--event'
  return L.divIcon({
    className: 'event-map-marker',
    html: `<span class="event-map-marker__dot ${dotClass}" aria-hidden="true"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

function hasUserCoords() {
  return Number.isFinite(props.userLatitude) && Number.isFinite(props.userLongitude)
}

function initMap() {
  if (!mapRoot.value || !Number.isFinite(props.latitude) || !Number.isFinite(props.longitude)) return
  if (map) {
    map.remove()
    map = null
    eventMarker = null
    userMarker = null
  }

  map = L.map(mapRoot.value, {
    scrollWheelZoom: false,
    zoomControl: true,
    attributionControl: true,
  })

  map.attributionControl.setPrefix(false)

  // Светлая подложка без детальных POI-иконок OSM (ближе к Mapsui в мобильном клиенте).
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map)

  eventMarker = L.marker([props.latitude, props.longitude], { icon: createMarkerIcon('event') }).addTo(map)
  const label = props.title || props.address || 'Место проведения'
  eventMarker.bindPopup(label)

  if (hasUserCoords()) {
    userMarker = L.marker([props.userLatitude, props.userLongitude], { icon: createMarkerIcon('user') }).addTo(map)
    userMarker.bindPopup('Вы здесь')
    const bounds = L.latLngBounds(
      [props.latitude, props.longitude],
      [props.userLatitude, props.userLongitude]
    )
    map.fitBounds(bounds.pad(0.25))
  } else {
    map.setView([props.latitude, props.longitude], MAP_ZOOM)
  }
}

onMounted(() => {
  initMap()
  setTimeout(() => map?.invalidateSize(), 200)
})

watch(
  () => [props.latitude, props.longitude, props.title, props.userLatitude, props.userLongitude],
  () => {
    initMap()
    setTimeout(() => map?.invalidateSize(), 200)
  }
)

onUnmounted(() => {
  map?.remove()
  map = null
})

const osmLink = () =>
  `https://www.openstreetmap.org/?mlat=${props.latitude}&mlon=${props.longitude}#map=${MAP_ZOOM}/${props.latitude}/${props.longitude}`
</script>

<template>
  <div class="space-y-2 event-location-map">
    <div
      ref="mapRoot"
      class="h-56 w-full overflow-hidden rounded-lg border border-border sm:h-64"
      role="img"
      :aria-label="title || address || 'Карта места проведения'"
    />
    <a
      :href="osmLink()"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-block text-sm text-primary hover:underline"
    >
      {{ $t('eventDetails.openOnMap') }}
    </a>
  </div>
</template>

<style scoped>
.event-location-map :deep(.event-map-marker) {
  background: transparent;
  border: none;
}

.event-location-map :deep(.event-map-marker__dot) {
  display: block;
  width: 14px;
  height: 14px;
  margin: 3px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.35);
}

.event-location-map :deep(.event-map-marker__dot--event) {
  background: #ef4444;
}

.event-location-map :deep(.event-map-marker__dot--user) {
  background: #2563eb;
}

.event-location-map :deep(.leaflet-control-attribution) {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.85);
}
</style>
