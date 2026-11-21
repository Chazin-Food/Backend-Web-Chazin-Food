FROM mysql:8.0

# Variables de entorno deben inyectarse en tiempo de ejecución desde docker-compose o entorno aislado (sin credenciales fijas en la imagen)
ENV MYSQL_DATABASE=chazinfood

EXPOSE 3306

# Use the official image entrypoint. Any SQL files placed in
# /docker-entrypoint-initdb.d/ will be executed on first startup.
