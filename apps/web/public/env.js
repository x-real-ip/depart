// Plaatsvervanger voor lokale ontwikkeling. In de container wordt dit bestand
// bij het opstarten overschreven met de waarden uit de omgeving
// (zie docker-entrypoint.d/40-generate-env.sh).
window.__ENV__ = {
  API_TOKEN: "",
  APP_TITLE: "Depart",
};
