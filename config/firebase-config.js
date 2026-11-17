/*
 * Nexus — configuração do projeto Firebase (nexus-rtc).
 *
 * Estes valores identificam o projeto e são públicos por natureza: NÃO são segredos.
 * A segurança dos dados vem das regras do Firestore (firestore.rules) e do login do Firebase Auth,
 * nunca do sigilo desta configuração. Mesmo assim, restrinja a chave de API no Google Cloud
 * (Credenciais › chave › "Referenciadores HTTP") aos domínios em que o site roda — veja docs/FIREBASE.md.
 *
 * NUNCA coloque aqui chave de conta de serviço (service account), senha ou token de administrador.
 */
window.NEXUS_FIREBASE = {
  apiKey: 'AIzaSyDGpQFtBQA9LLQE6qiAIzW6a3KTJghOeMY',
  authDomain: 'nexus-rtc.firebaseapp.com',
  projectId: 'nexus-rtc',
  storageBucket: 'nexus-rtc.firebasestorage.app',
  messagingSenderId: '83203483006',
  appId: '1:83203483006:web:8f1dfcceb4d758ac9b3f2f'
  // Desenvolvimento local com o Firebase Emulator Suite (nunca em produção):
  // , emulador: { host: '127.0.0.1', auth: 9099, firestore: 8080 }
};
