import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {getFirestore} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

// Configuración pública de la app web EXISTENTE. La autorización se valida en Firestore.
export const firebaseConfig={
 apiKey:"AIzaSyDPh-AFdST9Ax_Eoho-wT0shlWlCHad6Zg",
 authDomain:"agora-dejavu-38b8c.firebaseapp.com",
 projectId:"agora-dejavu-38b8c",
 storageBucket:"agora-dejavu-38b8c.firebasestorage.app",
 messagingSenderId:"775680965171",
 appId:"1:775680965171:web:274557c8c9c25ff304c146"
};
const config=firebaseConfig;
const app=getApps().length?getApps()[0]:initializeApp(config);
export const auth=getAuth(app);
export const db=getFirestore(app);
