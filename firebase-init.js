/* ÁGORA Pedidos · inicialización Firebase (configuración pública web).
 * Esta capa solo prepara Firebase Auth y Firestore. No migra ni sincroniza
 * datos locales hasta configurar permisos, respaldos y lógica de guardado.
 */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const firebaseConfig = {
  "apiKey": "AIzaSyDPh-AFdST9Ax_Eoho-wT0shlWlCHad6Zg",
  "authDomain": "agora-dejavu-38b8c.firebaseapp.com",
  "projectId": "agora-dejavu-38b8c",
  "storageBucket": "agora-dejavu-38b8c.firebasestorage.app",
  "messagingSenderId": "775680965171",
  "appId": "1:775680965171:web:274557c8c9c25ff304c146"
};
try {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  window.AGORA_FIREBASE = Object.freeze({app, auth, firestore, config: Object.freeze(firebaseConfig), initialized: true, dataSyncEnabled: false});
  window.dispatchEvent(new CustomEvent("agora:firebase-ready", {detail: {projectId: firebaseConfig.projectId}}));
} catch (error) {
  console.error("ÁGORA: No se pudo inicializar Firebase", error);
  window.dispatchEvent(new CustomEvent("agora:firebase-error", {detail: {message: String(error?.message || error)}}));
}
