import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Estos datos son los mismos, Vercel los protege por detrás
const firebaseConfig = {
  apiKey: "AIzaSyBdXFDZ5rv4oKCefJDrFvPzC3KHVmXBjrg",
  authDomain: "gastroia-78d9b.firebaseapp.com",
  projectId: "gastroia-78d9b",
  storageBucket: "gastroia-78d9b.firebasestorage.app",
  messagingSenderId: "154559797124",
  appId: "1:154559797124:web:8ca2a3facf4d94322cafd1"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app); // ¡Listo para guardar mesas y ventas!