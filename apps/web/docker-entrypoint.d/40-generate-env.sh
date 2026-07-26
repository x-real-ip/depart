#!/bin/sh
# Rendert env.js uit de omgeving bij het opstarten van de container, zodat de
# browser-app runtime-configuratie krijgt zonder opnieuw te bouwen.
set -eu

: "${API_TOKEN:=}"
: "${APP_TITLE:=Depart}"

envsubst '${API_TOKEN} ${APP_TITLE}' \
  < /etc/nginx/env.js.template \
  > /usr/share/nginx/html/env.js
