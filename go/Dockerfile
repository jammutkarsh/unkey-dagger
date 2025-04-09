FROM scratch
# Use ARG to dynamically specify the binary name
ARG BINARY=unkey-health
COPY ${BINARY} /app
ENTRYPOINT ["/app"]