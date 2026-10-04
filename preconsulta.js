/* ═══════════════════════════════════════════════════════════════════════
   EXAMES PARA A CONSULTA (sql/019) — na véspera e no dia de uma consulta
   marcada pela clínica, o app pergunta se o paciente deixa aquele médico
   ver os exames feitos DEPOIS da última consulta com ele.

     "📅 Amanhã você tem consulta com Dr. Décio. Deixar ele ver seus
      3 exames feitos depois da última consulta (12/06)?"
      [Deixar ver]  [Ver quais]  [Agora não]

   A data da última consulta vem do Indiclin (`ultima_consulta` no
   compromisso). Sem ela (primeira consulta), os dos últimos 12 meses.
   O padrão é NÃO: só o toque em "Deixar ver" libera, e só a lista que o
   paciente viu. Quem garante que o médico não vê o resto é o banco.

   Não aparece quando: o médico já vê tudo ("manter liberado"), não há
   exame novo, o paciente disse "Agora não" para esta consulta, ou o
   banco ainda não tem o sql/019 (a leitura falha e o recurso se cala).

   SEM exame novo (ou com o médico já vendo), o cartão vira "o que levar"
   (04/10/2026): cita os exames que a clínica pediu e ainda não foram
   guardados (`exames_pedidos`, desde a última consulta) e oferece
   [📷 Guardar exame] [❓ Como fazer] [Agora não]. No DIA da consulta, com
   exame guardado, lembra "Ao médico → Gerar código". O "Agora não" desse
   cartão vale por dia: dito na véspera, ele volta no dia com o lembrete.
   Com o que foi pedido já guardado, diz que os exames estão aqui, prontos
   para mostrar ao médico (pedido do usuário, 04/10).

   Carregado depois de conversa.js e antes de abas.js. Usa `sb`,
   `compromissos`, `documentos`, `pessoas`, `diasAte`, `comoFalta`,
   `somarMeses`, `hojeISO`, `dataBR`, `escaparHTML`, `ICONES`, `aviso`,
   `confirmarModal`, `abrirDocumento` e `FECHAR_TELA_CHEIA`.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const tela = document.getElementById("tela-pre");
  if (!tela) return;
  const q = (id) => document.getElementById(id);

  let pronto = false;          // o banco respondeu (sql/019 rodado)
  let liberadas = [];          // liberacoes_consulta vivas
  let autorizados = [];        // autorizacoes vivas (quem já vê tudo)
  let pedidos = [];            // exames_pedidos dos últimos 12 meses
  let lidoEm = 0;
  let lendo = null;
  let aberta = null;           // consulta na lista "Ver quais"

  const chaveNao = (c) => "pre-nao-" + c.id;
  function disseNao(c) { try { return localStorage.getItem(chaveNao(c)) === "1"; } catch (e) { return false; } }
  const chaveLevar = (c) => "pre-levar-" + c.id + "-" + hojeISO();
  function dispensouLevar(c) { try { return localStorage.getItem(chaveLevar(c)) === "1"; } catch (e) { return false; } }

  function dataDoc(d) { return diaDoDocumento(d); }
  function corte(c) { return c.ultima_consulta || somarMeses(hojeISO(), -12); }

  // Os exames da pessoa feitos DEPOIS da última consulta (no mesmo dia, o
  // médico já viu), mais recentes primeiro.
  function novos(c) {
    const desde = corte(c);
    return (typeof documentos === "undefined" ? [] : documentos)
      // Só exame e laudo, com data informada pela pessoa e guardados por ela:
      // receita/relatório e o que a própria clínica mandou não são "exames novos",
      // e o "Não sei" não tem como ser depois da última consulta (sql/022, mesma conta).
      .filter((d) => d.pessoa_id === c.origem_pessoa_id && d.data_documento && d.origem !== "clinica"
        && ["exame", "laudo"].includes(d.tipo) && d.data_documento > desde)
      .sort((a, b) => dataDoc(b).localeCompare(dataDoc(a)));
  }

  // Exames que a clínica pediu a esta pessoa desde a última consulta e que
  // ainda não foram guardados (a mesma conta do aviso da véspera, sql/023).
  function pedidosDa(c) {
    const desde = corte(c);
    return pedidos.filter((p) => p.pessoa_id === c.origem_pessoa_id && p.clinica_id === c.origem_clinica_id
      && p.pedido_em >= desde && p.pedido_em < c.quando);
  }
  const faltam = (c) => pedidosDa(c).filter((p) => !p.trazido_em && !p.marcado_manual).map((p) => p.item);
  const prontos = (c) => pedidosDa(c).filter((p) => p.trazido_em || p.marcado_manual).map((p) => p.item);
  // Algum exame/laudo desta pessoa já guardado (vale o "Gerar código").
  function temExames(c) {
    return (typeof documentos === "undefined" ? [] : documentos)
      .some((d) => d.pessoa_id === c.origem_pessoa_id && ["exame", "laudo"].includes(d.tipo));
  }

  function medico(c) {
    return c.origem_medico_nome || String(c.titulo || "").replace(/^(Consulta|Retorno|Exame)\s+com\s+/i, "") || "o médico";
  }

  async function atualizar(forcar) {
    if (!forcar && Date.now() - lidoEm < 120000) return;
    if (lendo) return lendo;
    lendo = (async () => {
      const agora = new Date().toISOString();
      try {
        const [lc, au, pe] = await Promise.all([
          sb.from("liberacoes_consulta")
            .select("id, compromisso_id, pessoa_id, clinica_id, medico_id, medico_nome, documento_ids, valido_ate")
            .is("revogado_em", null).gt("valido_ate", agora),
          sb.from("autorizacoes").select("pessoa_id, clinica_id, medico_id")
            .is("revogado_em", null).gt("expira_em", agora),
          sb.from("exames_pedidos").select("item, clinica_id, pessoa_id, pedido_em, trazido_em, marcado_manual")
            .gte("pedido_em", somarMeses(hojeISO(), -12)).order("pedido_em").limit(200),
        ]);
        if (lc.error || au.error) throw (lc.error || au.error);
        liberadas = lc.data || [];
        autorizados = au.data || [];
        if (!pe.error) pedidos = pe.data || [];
        pronto = true;
      } catch (e) { /* sem rede ou sem o sql/019: o recurso se cala */ }
      lidoEm = Date.now();   // certo ou errado, a próxima leitura espera 2 min
      lendo = null;
      if (window.Conversa) Conversa.redesenharInicio();
    })();
    return lendo;
  }

  // Consultas de hoje e amanhã, marcadas pela clínica, com o que fazer.
  function situacoes() {
    if (!pronto || typeof compromissos === "undefined") return [];
    const out = [];
    for (const c of compromissos) {
      if (c.origem !== "clinica" || !c.origem_pessoa_id || !c.origem_medico_id) continue;
      if (c.feito_em || c.apagado || ![0, 1].includes(diasAte(c.quando))) continue;
      const vendo = autorizados.some((a) => a.pessoa_id === c.origem_pessoa_id
          && a.clinica_id === c.origem_clinica_id && a.medico_id === c.origem_medico_id);
      const lib = liberadas.find((l) => l.compromisso_id === c.id);
      const todos = novos(c);
      const docs = vendo ? [] : todos;
      const falta = faltam(c), pronto = prontos(c);
      if (lib) out.push({ c, estado: "liberado", docs, lib, falta });
      else if (docs.length && !disseNao(c)) out.push({ c, estado: "pergunta", docs, falta });
      // "O que levar": com o médico já vendo, só faz sentido se falta exame.
      // Disse "Agora não" à pergunta na véspera: não emenda outro cartão
      // (sem pedido faltando); no dia, volta com o lembrete do código.
      // Com o médico já vendo, o cartão só aparece se falta exame ou se há o
      // que dizer "já está aqui" (pedido guardado ou exame novo).
      if (!dispensouLevar(c) && !(docs.length && !disseNao(c))
          && (!(vendo || lib) || falta.length || pronto.length || todos.length)
          && !(disseNao(c) && diasAte(c.quando) === 1 && !falta.length))
        out.push({ c, estado: "levar", docs: [], falta, pronto, novos: todos.length, vendo: !!(vendo || lib),
                   codigo: !vendo && !lib && (diasAte(c.quando) === 0 || pronto.length > 0) && temExames(c) });
    }
    return out.sort((a, b) => String(a.c.quando).localeCompare(String(b.c.quando)));
  }

  // "Dr. Décio pediu: Holter 24h, Ecocardiograma" (até 3 e "mais N").
  function htmlFaltam(s) {
    if (!s.falta.length) return "";
    const ver = s.falta.slice(0, 3).map(escaparHTML).join(", ")
      + (s.falta.length > 3 ? ` e mais ${s.falta.length - 3}` : "");
    return `<div class="pre-falta">🧪 Falta guardar o que ${escaparHTML(medico(s.c))} pediu: <b>${ver}</b>.</div>`;
  }

  // Já guardados: os pedidos da consulta, ou (sem pedido conhecido e com o
  // médico vendo) os exames novos. "Esperando para mostrar ao médico".
  function htmlProntos(s) {
    const m = escaparHTML(medico(s.c));
    const ver = s.pronto.slice(0, 3).map(escaparHTML).join(", ")
      + (s.pronto.length > 3 ? ` e mais ${s.pronto.length - 3}` : "");
    const ja = s.vendo ? ` ${m} já pode vê-los.` : "";
    if (s.pronto.length && !s.falta.length)
      return `<div class="pre-ok">✓ Os exames que ${m} pediu já estão aqui: <b>${ver}</b>. Prontos para mostrar na consulta.${ja}</div>`;
    if (s.pronto.length)
      return `<div class="pre-ok">✓ Já guardados: <b>${ver}</b>.</div>`;
    if (s.vendo && s.novos)
      return `<div class="pre-ok">✓ Seus ${s.novos === 1 ? "exame novo já está" : s.novos + " exames novos já estão"} aqui, e ${m} já pode vê-los.</div>`;
    return "";
  }

  function textoLevar(s) {
    const c = s.c;
    const ok = htmlProntos(s);
    const tx = s.falta.length ? htmlFaltam(s) + ok
      : ok ? ok
      : s.codigo ? "" : `<div class="pre-tx">Tem exame em papel ou PDF para levar? Guarde aqui antes de ir.</div>`;
    const cod = s.codigo
      ? `<div class="pre-tx">No consultório, toque em <b>Ao médico</b> → <b>Gerar código</b> e mostre o número.</div>` : "";
    const tudoPronto = !s.falta.length && !!ok;
    return `${cabecalho(c)}${tx}${cod}
      <div class="pre-bts">
        ${(s.codigo || tudoPronto) && !s.falta.length ? "" : `<button type="button" class="pre-sim" data-pre-acao="foto" data-comp="${escaparHTML(c.id)}">📷 Guardar exame</button>`}
        <button type="button" class="pre-quais" data-pre-acao="guia" data-comp="${escaparHTML(c.id)}">❓ ${tudoPronto ? "Como mostrar" : "Como fazer"}</button>
        <button type="button" class="pre-nao" data-pre-acao="levar_nao" data-comp="${escaparHTML(c.id)}">${tudoPronto ? "Ok" : "Agora não"}</button>
      </div>`;
  }

  function cabecalho(c) {
    const quando = (t => t[0].toUpperCase() + t.slice(1))(comoFalta(diasAte(c.quando)).texto);
    const quem = pessoas.length > 1 ? ` de ${escaparHTML(nomeDaPessoa(pessoaDe(c.origem_pessoa_id)))}` : "";
    return `<div class="pre-tit">📅 <b>${quando}</b>: consulta${quem} com <b>${escaparHTML(medico(c))}</b>.</div>`;
  }

  function textoPergunta(s) {
    if (s.estado === "levar") return textoLevar(s);
    const c = s.c, n = s.docs.length;
    const desde = c.ultima_consulta
      ? `feito${n > 1 ? "s" : ""} depois da última consulta (${dataBR(c.ultima_consulta).slice(0, 5)})`
      : `feito${n > 1 ? "s" : ""} nos últimos 12 meses`;
    return `${cabecalho(c)}
      <div class="pre-tx">Deixar ${/^dra\b/i.test(medico(c)) ? "ela" : "ele"} ver ${n > 1 ? (pessoas.length > 1 ? "os " : "seus ") : ""}<b>${n} exame${n > 1 ? "s" : ""}</b> ${desde}?</div>
      <div class="pre-bts">
        <button type="button" class="pre-sim" data-pre-acao="sim" data-comp="${escaparHTML(c.id)}">Deixar ver</button>
        <button type="button" class="pre-quais" data-pre-acao="quais" data-comp="${escaparHTML(c.id)}">Ver quais</button>
        <button type="button" class="pre-nao" data-pre-acao="nao" data-comp="${escaparHTML(c.id)}">Agora não</button>
      </div>${htmlFaltam(s)}`;
  }

  // Para o alto das Conversas: a primeira pergunta pendente, ou nada.
  function cartaoInicio() {
    const s = situacoes().find((x) => x.estado === "pergunta" || x.estado === "levar");
    if (!s) return null;
    const div = document.createElement("div");
    div.className = "pre-cartao";
    div.innerHTML = textoPergunta(s);
    return div;
  }

  // Para o fim do fio da conversa daquela clínica e daquela pessoa.
  function htmlConversa(cv) {
    const s = situacoes().find((x) => (x.estado === "pergunta" || x.estado === "levar")
      && x.c.origem_clinica_id === cv.clinica_id && x.c.origem_pessoa_id === cv.pessoa_id);
    return s ? `<div class="pre-cartao no-fio">${textoPergunta(s)}</div>` : "";
  }

  async function liberar(c, ids) {
    if (!navigator.onLine) return aviso("Liberar os exames precisa de internet.", "info", "Sem conexão");
    const { data, error } = await sb.rpc("liberar_para_consulta", { p_compromisso: c.id, p_documentos: ids });
    if (error) {
      console.warn("[preconsulta]", error.message);
      return aviso(/PASSOU/.test(error.message) ? "Esta consulta já passou."
        : "Não consegui liberar agora. Tente de novo.", "erro");
    }
    const n = (data && data[0] && data[0].qtd) || ids.length;
    aviso(`Pronto! ${escaparHTML(medico(c))} vai ver ${n} exame${n > 1 ? "s" : ""} seu${n > 1 ? "s" : ""} na consulta. `
      + "O acesso termina no fim do dia da consulta.", "ok");
    fecharLista();
    await atualizar(true);
    if (window.Conversa) Conversa.redesenharConversa();
  }

  async function revogar(id, nome, n) {
    if (!await confirmarModal(`Tirar o acesso de ${nome || "o médico"} ${n ? "aos " + n + " exames" : "aos exames"}?`
        + LINHA + LINHA + "Ele deixa de ver na hora.", { textoConfirmar: "Tirar o acesso", perigo: true })) return false;
    const { error } = await sb.rpc("revogar_liberacao_consulta", { p_id: id });
    if (error) { aviso("Não consegui tirar agora. Tente de novo.", "erro"); return false; }
    aviso("Pronto. Ele não vê mais esses exames.", "ok");
    await atualizar(true);
    if (window.Conversa) Conversa.redesenharConversa();
    return true;
  }

  // ── "Ver quais": a lista, marcada; desmarca o que não quiser ──────────
  function abrirLista(c) {
    aberta = c;
    const docs = novos(c);
    q("pre-titulo").textContent = "Exames para " + medico(c);
    q("pre-sub").textContent = c.ultima_consulta
      ? "Feitos depois da última consulta (" + dataBR(c.ultima_consulta) + ")"
      : "Feitos nos últimos 12 meses";
    const lista = q("pre-lista");
    lista.innerHTML = "";
    for (const d of docs) {
      const linha = document.createElement("label");
      linha.className = "pre-item";
      linha.innerHTML = `<input type="checkbox" checked value="${escaparHTML(d.id)}">
        <span class="pre-ico">${ICONES[d.tipo] || "📎"}</span>
        <span class="pre-nome"><b>${escaparHTML(d.nome || "Documento")}</b><small>${d.data_documento ? dataBR(d.data_documento) : "sem data · guardado em " + dataBR(dataDoc(d))}</small></span>
        <button type="button" class="pre-ver">Ver</button>`;
      linha.querySelector(".pre-ver").onclick = (e) => { e.preventDefault(); abrirDocumento(d); };
      lista.appendChild(linha);
    }
    lista.onchange = contar;
    contar();
    tela.classList.remove("escondido");
  }
  function marcados() { return [...q("pre-lista").querySelectorAll("input:checked")].map((i) => i.value); }
  function contar() {
    const n = marcados().length;
    const b = q("pre-confirmar");
    b.disabled = !n;
    b.textContent = n ? `Deixar ver ${n === 1 ? "este exame" : "estes " + n + " exames"}` : "Marque pelo menos um";
  }
  function fecharLista() { aberta = null; tela.classList.add("escondido"); }
  q("pre-fechar").onclick = fecharLista;
  q("pre-confirmar").onclick = async (e) => {
    const b = e.currentTarget;
    if (!aberta || b.disabled) return;   // segundo toque com internet lenta
    b.disabled = true; b.textContent = "Liberando…";
    try { await liberar(aberta, marcados()); } finally { b.disabled = false; contar(); }
  };

  // Um só lugar para os botões do cartão (início e conversa).
  function acao(qual, compId) {
    const c = (compromissos || []).find((x) => x.id === compId);
    if (!c) return;
    if (qual === "sim") return liberar(c, novos(c).map((d) => d.id));
    if (qual === "quais") return abrirLista(c);
    if (qual === "nao") {
      try { localStorage.setItem(chaveNao(c), "1"); } catch (e) {}
      aviso("Tudo bem. Se mudar de ideia, toque na linha 🔒 no alto da conversa com a clínica.", "info");
      if (window.Conversa) { Conversa.redesenharInicio(); Conversa.redesenharConversa(); }
    }
    if (qual === "levar_nao") {
      try { localStorage.setItem(chaveLevar(c), "1"); } catch (e) {}
      if (window.Conversa) { Conversa.redesenharInicio(); Conversa.redesenharConversa(); }
    }
    // Guardar na pessoa da consulta: numa conta com a família, a câmera
    // salvaria no acervo de quem estivesse escolhido.
    if (qual === "foto") {
      if (typeof trocarPessoa === "function" && c.origem_pessoa_id
          && (pessoas || []).some((p) => p.id === c.origem_pessoa_id)) trocarPessoa(c.origem_pessoa_id);
      if (window.Abas) Abas.ir("documentos");
      q("btn-fotografar")?.click();
    }
    // Guia no "Mostre ao médico" quando não falta nada a guardar e há o que
    // mostrar (o cartão diz "Como mostrar"); senão, no papel.
    if (qual === "guia" && window.Guia) {
      const s = situacoes().find((x) => x.c.id === c.id && x.estado === "levar");
      Guia.abrir(s && !s.falta.length && (s.codigo || htmlProntos(s)) ? 4 : 0);
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pre-acao]");
    if (b) { e.stopPropagation(); acao(b.dataset.preAcao, b.dataset.comp); }
  }, true);

  // O voltar do Android fecha o visualizador primeiro (aberto POR CIMA da
  // lista pelo "Ver"), depois a lista, depois o resto.
  if (typeof FECHAR_TELA_CHEIA === "object") {
    const resto = { ...FECHAR_TELA_CHEIA };
    for (const k of Object.keys(FECHAR_TELA_CHEIA)) delete FECHAR_TELA_CHEIA[k];
    Object.assign(FECHAR_TELA_CHEIA, { "tela-visu": resto["tela-visu"], "tela-pre": "pre-fechar" }, resto);
  }

  // A pergunta que vale também pela linha da conversa: consulta da clínica
  // hoje/amanhã com exames novos, mesmo depois do "Agora não".
  function perguntaDe(cv) {
    if (!pronto) return null;
    const c = (compromissos || []).find((x) => x.origem === "clinica" && x.origem_clinica_id === cv.clinica_id
      && x.origem_pessoa_id === cv.pessoa_id && x.origem_medico_id && !x.feito_em && [0, 1].includes(diasAte(x.quando)));
    return c && novos(c).length && !liberadas.some((l) => l.compromisso_id === c.id) ? c : null;
  }

  // Aviso da véspera tocado (sw.js): abre direto a lista "Ver quais".
  // A agenda e os documentos chegam depois do login: espera até ~20 s.
  function abrirPeloAviso(compId, tentativas = 40) {
    const c = typeof compromissos !== "undefined" && compromissos.find((x) => x.id === compId);
    if (!c || typeof documentos === "undefined" || !documentos.length) {
      if (tentativas > 0) setTimeout(() => abrirPeloAviso(compId, tentativas - 1), 500);
      else aviso("Não consegui abrir os exames agora. Abra a conversa com a clínica para liberar.", "info");
      return;
    }
    atualizar(true).then(() => {
      if (liberadas.some((l) => l.compromisso_id === c.id))
        return aviso(`Você já deixou ${escaparHTML(medico(c))} ver seus exames desta consulta.`, "info");
      if (!novos(c).length) return aviso("Não há exame novo para esta consulta.", "info");
      abrirLista(c);
    });
  }
  const pedido = /#preconsulta=([^&]+)/.exec(location.hash);
  if (pedido) {
    history.replaceState(history.state, "", location.pathname + location.search);
    abrirPeloAviso(decodeURIComponent(pedido[1]));
  }
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      if ((e.data || {}).abrir === "preconsulta") abrirPeloAviso(e.data.compromisso_id);
    });
  }

  window.PreConsulta = { atualizar, cartaoInicio, htmlConversa, abrirLista, revogar, perguntaDe,
                         liberadasDe: (cv) => liberadas.filter((l) => l.pessoa_id === cv.pessoa_id && l.clinica_id === cv.clinica_id) };
})();
