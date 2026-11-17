# Testes das regras do Firestore

Validam `firestore.rules` no **Firebase Emulator Suite** (nada é enviado ao projeto real).

Requisitos: Node 18+ e **Java 11+** (o emulador do Firestore é Java).

```
cd tests/rules
npm install
npm test
```

Cobrem: isolamento entre clientes, administrador sem acesso aos dados dos clientes, bloqueio, módulos liberados,
revisão obrigatória (anti-sobrescrita), limites de tamanho e impossibilidade de escalar privilégio.
Rode sempre que alterar `firestore.rules` e **antes de publicar** as regras.
