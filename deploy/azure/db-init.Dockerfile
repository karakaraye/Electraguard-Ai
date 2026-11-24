# One-off job image that creates the database roles (see db-init.sh).
FROM postgres:17.12-bookworm
COPY --chmod=0555 deploy/azure/db-init.sh /usr/local/bin/electraguard-db-init
USER postgres
CMD ["/usr/local/bin/electraguard-db-init"]
