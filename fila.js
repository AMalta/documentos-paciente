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

/* Este arquivo e o DONO do banco local. A agenda (agenda.js) guarda dados
   no mesmo IndexedDB, e duas partes do codigo nao podem abrir o mesmo banco
   pedindo versoes diferentes: a segunda a chamar recebe erro e fica sem
   banco nenhum. Entao a versao e as lojas sao declaradas AQUI, num lugar
   so, e quem precisa pede `BancoLocal.abrir()`. */
const VERSAO_BANCO = 2;   // 1: fila.  2: + compromissos (agenda)

const BancoLocal = (() => {
  const NOME = "exames-externos";
  let bancoPromise = null;
  return {
    abrir() {
      if (bancoPromise) return bancoPromise;
      bancoPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(NOME, VERSAO_BANCO);
        req.onupgradeneeded = () => {
          const db = req.result;
          // Sem `else`: quem vem da versao 1 ja tem "fila" e so ganha
          // "compromissos"; instalacao nova ganha as duas.
          if (!db.objectStoreNames.contains("fila")) {
            db.createObjectStore("fila", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("compromissos")) {
            db.createObjectStore("compromissos", { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return bancoPromise;
    },
  };
})();

const FilaDB = (() => {
  const LOJA = "fila";
  const abrir = BancoLocal.abrir;

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
