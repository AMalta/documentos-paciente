/* ═══════════════════════════════════════════════════════════════════════
   AGENDA — local-first, como o resto do módulo.

   LER é sempre do celular. Compromisso é a informação que a pessoa vai
   consultar no corredor do consultório, com o sinal que tiver: depender da
   rede para mostrar a data da própria consulta seria o pior momento
   possível para falhar.

   ESCREVER grava local e sobe em paralelo — não é "grava e envia quando
   reconectar". Para quem tocou em Salvar, está salvo desde o primeiro
   segundo, que é o que ele entendeu.

   DUAS MARCAS LOCAIS que não existem no servidor:
     `pendente`  a linha tem trabalho local ainda não confirmado lá.
     `apagado`   foi apagada aqui e o servidor ainda não soube. Lápide, e
                 não remoção direta: apagar só localmente faria a linha
                 RESSUSCITAR na próxima descida do servidor — o mesmo zumbi
                 de exclusão que o Indiclin já pagou para aprender.

   E a ordem da sincronização é sempre SOBE ANTES DE DESCER. Descer
   primeiro sobrescreveria com a versão antiga do servidor aquilo que a
   pessoa acabou de escrever offline.
   ═══════════════════════════════════════════════════════════════════════ */
const AgendaDB = (() => {
  const LOJA = "compromissos";

  async function transacao(modo, fn) {
    const db = await BancoLocal.abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOJA, modo);
      const pedido = fn(tx.objectStore(LOJA));
      tx.oncomplete = () => resolve(pedido?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    // Tudo o que esta conta tem, sem as lápides. Ordenado por data: é a
    // única ordem que a tela usa.
    async listar(pacienteId) {
      const todos = await transacao("readonly", (l) => l.getAll());
      return (todos || [])
        .filter((c) => c.paciente_id === pacienteId && !c.apagado)
        .sort((a, b) => String(a.quando + (a.hora || ""))
          .localeCompare(String(b.quando + (b.hora || ""))));
    },
    // Inclui as lápides e os pendentes — é o que a sincronização precisa ver.
    async todos() {
      return (await transacao("readonly", (l) => l.getAll())) || [];
    },
    async guardar(c) {
      await transacao("readwrite", (l) => l.put(c));
      return c;
    },
    async remover(id) {
      await transacao("readwrite", (l) => l.delete(id));
    },
  };
})();

/* Os próximos, e o quanto falta. Separado da tela de propósito: é a regra
   que decide o que é "urgente", e ela precisa ser testável sem DOM. */
const DIA_MS = 86400000;

// hojeISO vive em comum.js, carregado antes deste arquivo. Estava aqui
// primeiro, e certo; a lista de documentos e que usava toISOString() e
// errava. Uma copia so, e as duas partes acertam ou erram juntas.

function diasAte(dataISO) {
  const [a, m, d] = String(dataISO).split("-").map(Number);
  const [ha, hm, hd] = hojeISO().split("-").map(Number);
  // Meio-dia nos dois lados: evita que horário de verão (uma hora a mais ou
  // a menos) empurre a diferença para o dia errado.
  const alvo = new Date(a, m - 1, d, 12);
  const hoje = new Date(ha, hm - 1, hd, 12);
  return Math.round((alvo - hoje) / DIA_MS);
}

function comoFalta(dias) {
  if (dias < 0) return { texto: dias === -1 ? "foi ontem" : `foi há ${-dias} dias`,
                         urgencia: "passou" };
  if (dias === 0) return { texto: "hoje", urgencia: "hoje" };
  if (dias === 1) return { texto: "amanhã", urgencia: "hoje" };
  if (dias <= 7) return { texto: `em ${dias} dias`, urgencia: "perto" };
  if (dias <= 30) return { texto: `em ${dias} dias`, urgencia: "longe" };
  const meses = Math.round(dias / 30);
  return { texto: meses <= 1 ? "em 1 mês" : `em ${meses} meses`, urgencia: "longe" };
}

/* O que vai no topo da tela: o que ainda não foi feito, mais o que passou e
   ficou sem resposta. Passado sem resposta APARECE de propósito — some-lo
   apagaria a única pergunta que importa depois da data: "você foi?". */
function proximosCompromissos(lista, limite = 3) {
  const abertos = lista.filter((c) => !c.feito_em);
  const futuros = abertos.filter((c) => diasAte(c.quando) >= 0);
  const passados = abertos.filter((c) => diasAte(c.quando) < 0)
    .sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  // Atrasado primeiro: é o que exige ação. Depois o que vem chegando.
  return [...passados.slice(0, 2), ...futuros].slice(0, limite);
}

/* Soma meses preservando o fim do mês. Sem isto, "repetir a cada 1 mês" a
   partir de 31/01 cairia em 03/03 — o JavaScript transborda a data. */
function somarMeses(dataISO, meses) {
  const [a, m, d] = String(dataISO).split("-").map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const p = (n) => String(n).padStart(2, "0");
  return `${alvo.getFullYear()}-${p(alvo.getMonth() + 1)}-${p(Math.min(d, ultimoDia))}`;
}
