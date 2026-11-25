// Consentimiento explícito para GA4. No carga Google hasta la aceptación.
(() => {
  "use strict";
  const GA_ID = "G-YP7BT4LJ2Q";
  const STORAGE_KEY = "agora.analytics.consent.v1";
  const labels = new Map([
    ["/agora-compras-dejavu/portal-agora/", "ÁGORA · Portal Dejavú Marketing"],
    ["/agora-compras-dejavu/portal-agora/index.html", "ÁGORA · Portal Dejavú Marketing"],
    ["/agora-compras-dejavu/portal-agora/administrador/", "ÁGORA · Administrador"],
    ["/agora-compras-dejavu/portal-agora/agencia/", "ÁGORA · Agencia"],
    ["/agora-compras-dejavu/portal-agora/staff/", "ÁGORA · Staff"],
    ["/agora-compras-dejavu/portal-agora/mi-operacion/", "ÁGORA · Mi operación"],
    ["/agora-compras-dejavu/portal-agora/expediente/", "ÁGORA · Expediente privado"]
  ]);
  const title = labels.get(location.pathname);
  if (!title || document.getElementById("agora-analytics-consent")) return;
  let loaded = false;
  let pageSent = false;
  const safeLocation = location.origin + location.pathname;
  function loadAnalytics() {
    if (loaded) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", {
      analytics_storage: "denied", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied"
    });
    const tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_ID);
    tag.onload = () => {
      window.gtag("js", new Date());
      window.gtag("consent", "update", {
        analytics_storage: "granted", ad_storage: "denied",
        ad_user_data: "denied", ad_personalization: "denied"
      });
      window.gtag("config", GA_ID, {
        send_page_view: false, allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: safeLocation,
        page_referrer: location.origin + "/",
        page_title: title
      });
      if (!pageSent) {
        window.gtag("event", "page_view", {
          page_location: safeLocation,
          page_referrer: location.origin + "/",
          page_title: title
        });
        pageSent = true;
      }
    };
    document.head.appendChild(tag);
  }
  function setConsent(granted) {
    try { localStorage.setItem(STORAGE_KEY, granted ? "granted" : "denied"); } catch {}
    if (granted) loadAnalytics();
    else if (window.gtag) window.gtag("consent", "update", {
      analytics_storage: "denied", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied"
    });
  }
  window.agoraSetAnalyticsConsent = setConsent;
  const footer = document.querySelector("footer");
  if (!footer) return;
  const details = document.createElement("details");
  details.id = "agora-analytics-consent";
  details.style.cssText = "margin:12px auto 0;max-width:720px;text-align:left;font-size:12px;line-height:1.5";
  details.innerHTML = '<summary style="cursor:pointer">Privacidad y medición</summary>' +
    '<div style="padding:8px 0">' +
      '<p>Si permites analítica, Google Analytics 4 recibirá datos básicos de uso del portal, navegador y sesión. ÁGORA no envía nombres, correos, ID Dejavú, documentos, datos bancarios o de nómina, GPS, QR, códigos de acceso ni parámetros de la URL.</p>' +
      '<button type="button" data-consent="granted">Permitir analítica</button> ' +
      '<button type="button" data-consent="denied">Rechazar</button>' +
      '<span id="agora-consent-status" role="status" aria-live="polite" style="margin-left:8px"></span>' +
    '</div>';
  footer.appendChild(details);
  details.addEventListener("click", event => {
    const button = event.target.closest("button[data-consent]");
    if (!button) return;
    const granted = button.dataset.consent === "granted";
    setConsent(granted);
    document.getElementById("agora-consent-status").textContent =
      granted ? "Preferencia guardada." : "Analítica desactivada.";
    if (!granted) details.open = true;
  });
  try {
    if (localStorage.getItem(STORAGE_KEY) === "granted") loadAnalytics();
  } catch {}
})();
