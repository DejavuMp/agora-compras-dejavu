import {initializeApp} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth,inMemoryPersistence,setPersistence,signInWithEmailAndPassword,
  sendEmailVerification,updateProfile,signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {firebaseConfig} from "./firebase.js";

const allowed = new Map([
  ["admi.agora+qa.staff@gmail.com", "Staff Prueba ÁGORA"],
  ["admi.agora+qa.supervisor@gmail.com", "Supervisor Prueba ÁGORA"]
]);
const app = initializeApp(firebaseConfig, "agora-qa-activation");
const auth = getAuth(app);
const form = document.getElementById("activation-form");
const password = document.getElementById("password");
const button = document.getElementById("submit");
const status = document.getElementById("status");
form.addEventListener("submit", async event => {
  event.preventDefault();
  const email = document.getElementById("email").value;
  const displayName = allowed.get(email);
  const secret = password.value;
  if (!displayName || !secret) return;
  button.disabled = true;
  status.textContent = "Conectando con Firebase…";
  password.value = "";
  try {
    await setPersistence(auth, inMemoryPersistence);
    const credential = await signInWithEmailAndPassword(auth, email, secret);
    const user = credential.user;
    if (user.email !== email || !user.providerData.some(p => p.providerId === "password")) {
      throw new Error("Cuenta QA no válida.");
    }
    if (user.displayName !== displayName) await updateProfile(user, {displayName});
    if (user.emailVerified) {
      status.textContent = "El correo ya figura verificado. Puedes volver a ÁGORA.";
    } else {
      await sendEmailVerification(user, {
        url: location.origin + location.pathname,
        handleCodeInApp: false
      });
      status.textContent = "Enlace enviado al buzón seleccionado. Ábrelo para verificar y después vuelve a ÁGORA.";
    }
  } catch (error) {
    const code = String(error?.code || "");
    status.textContent = code.includes("invalid-credential") || code.includes("wrong-password")
      ? "No se pudo autenticar. Revisa la cuenta seleccionada y vuelve a intentar."
      : code.includes("too-many-requests")
        ? "Firebase limitó temporalmente los intentos. Inténtalo más tarde."
        : "No se pudo completar la activación. Verifica la configuración de Authentication.";
  } finally {
    password.value = "";
    try { await signOut(auth); } catch {}
    button.disabled = false;
  }
});
