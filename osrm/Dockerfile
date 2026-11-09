# Road routing for the Spokane area: OSRM (open-source routing engine) on OpenStreetMap
# road data. Built once at deploy time; serves drive times to the web service over
# Railway's private network. No API keys, no per-query cost.

# 1. Download Washington's road map and cut out the Spokane area.
FROM debian:bookworm-slim AS map
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl osmium-tool \
 && rm -rf /var/lib/apt/lists/*
ARG PBF_URL=https://download.geofabrik.de/north-america/us/washington-latest.osm.pbf
# West of Cheney to the Idaho line, Spangle/Rockford to north of Deer Park.
ARG BBOX=-118.2,47.2,-117.03,48.3
WORKDIR /map
RUN curl -fsSL --retry 3 -o region.osm.pbf "$PBF_URL" \
 && osmium extract --bbox "$BBOX" --strategy smart region.osm.pbf -o spokane.osm.pbf \
 && rm region.osm.pbf

# 2. Turn it into a routing graph (car profile, multi-level Dijkstra).
FROM osrm/osrm-backend:v5.25.0 AS graph
COPY --from=map /map/spokane.osm.pbf /data/spokane.osm.pbf
RUN osrm-extract -p /opt/car.lua /data/spokane.osm.pbf \
 && osrm-partition /data/spokane.osrm \
 && osrm-customize /data/spokane.osrm \
 && rm /data/spokane.osm.pbf

# 3. Serve it. Railway's private network is IPv6: listen on "::" (IPv6 and IPv4) when the
# container has an IPv6 address, else on IPv4 only (local Docker without IPv6).
FROM osrm/osrm-backend:v5.25.0
COPY --from=graph /data /data
EXPOSE 5000
CMD ["sh", "-c", "IP=0.0.0.0; grep -qv ' lo$' /proc/net/if_inet6 2>/dev/null && IP=::; echo \"osrm on [$IP]:${PORT:-5000}\"; exec osrm-routed --algorithm mld --ip $IP --port ${PORT:-5000} --max-table-size 1000 /data/spokane.osrm"]
