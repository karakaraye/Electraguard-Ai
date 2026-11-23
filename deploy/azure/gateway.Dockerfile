# The Azure gateway: the same routing, headers and limits as deploy/gateway.conf.template,
# behind Azure Container Apps, which terminates TLS.
FROM nginx:1.30.7-alpine
ENV NGINX_ENVSUBST_FILTER=^ELECTRAGUARD_(HOST|TRUSTED_PROXY_CIDR)$
COPY deploy/azure/gateway.conf.template /etc/nginx/templates/default.conf.template
