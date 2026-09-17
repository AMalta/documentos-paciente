/* ═══════════════════════════════════════════════════════════════════════
   Fila de envio — o documento fica guardado ANTES de subir.

   O paciente fotografa em casa, com o sinal que tem. Até agora, falhando o
   envio, as fotos viviam só na memória da página: fechou o app, perdeu tudo,
   e a mensagem pedia para tentar de novo — pedido que só funciona se a pessoa
   ainda estiver com a tela aberta.

   Aqui o toque em "Guardar" grava no IndexedDB primeiro. Daí em diante o
   envio é problema do app, não do usuário: ele tenta agora, tenta quando a
   conexão volta, e tenta de novo na próxima abertura. Para o paciente, o
   documento está guardado desde o primeiro segundo — que é o que ele
   entendeu quando tocou no botão.

   O retorno guarda `documento_id` e marca página por página, porque o envio
   pode morrer no meio: sem isso, a segunda tentativa criaria um documento
   duplicado com metade das folhas.
   ═══════════════════════════════════════════════════════════════════════ */

const FilaDB = (() => {
  const NOME = "exames-externos";
  const LOJA = "fila";
  let bancoPromise = null;

  function abrir() {
    if (bancoPromise) return bancoPromise;
    bancoPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LOJA)) {
          db.createObjectStore(LOJA, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return bancoPromise;
  }

  async function transacao(modo, fn) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOJA, modo);
      const pedido = fn(tx.objectStore(LOJA));
      tx.oncomplete = () => resolve(pedido?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    // Tudo o que ainda não subiu, na ordem em que foi guardado.
    async listar(pacienteId) {
      const todos = await transacao("readonly", (loja) => loja.getAll());
      return (todos || [])
        .filter((e) => !pacienteId || e.paciente_id === pacienteId)
        .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
    },
    async guardar(entrada) {
      await transacao("readwrite", (loja) => loja.put(entrada));
      return entrada;
    },
    async remover(id) {
      await transacao("readwrite", (loja) => loja.delete(id));
    },
    // Quantos documentos de OUTRAS contas ficaram para trás. Serve para não
    // enviar o acervo de alguém para a conta de outro depois de uma troca.
    async orfaos(pacienteId) {
      const todos = await transacao("readonly", (loja) => loja.getAll());
      return (todos || []).filter((e) => e.paciente_id !== pacienteId).length;
    },
  };
})();
