/* ═══════════════════════════════════════════════════════════════════════
   FALAR COM A CLÍNICA (sql/018) — conversa com a recepção, no jeito do
   WhatsApp: lista de conversas, balões, ✓✓, e o campo embaixo.

   Uma conversa por (pessoa, clínica) — a mesma relação de `recebimentos`:
   só conversa com a clínica quem aceitou receber dela. A mãe que guarda os
   exames do filho tem duas conversas com a mesma clínica, uma por pessoa,
   porque a recepção precisa saber DE QUEM é o assunto.

   O app escreve só pela função `enviar_mensagem`, que confere a pessoa, o
   recebimento e o limite do dia; a tabela não aceita insert do app.

   Carregado DEPOIS de app.js: usa `sb`, `pessoas`, `aviso`, `escaparHTML`,
   `nomeDaPessoa`, `pessoaDe` e `FECHAR_TELA_CHEIA` de lá.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const ASSUNTOS = {
    remarcar: { rotulo: "📅 Preciso remarcar", texto: "Olá! Preciso remarcar minha consulta. " },
    duvida:   { rotulo: "❓ Tenho uma dúvida",  texto: "Olá! Tenho uma dúvida: " },
    outro:    { rotulo: "💬 Outro assunto",    texto: "" },
  };
  const CORES = ["#00a884", "#1a73e8", "#e2711d", "#8e44ad", "#c0392b", "#16a085", "#2c3e50"];

  const tela = document.getElementById("tela-conversa");
  if (!tela) return;
  const q = (id) => document.getElementById(id);
  const c = {
    badge: q("btn-conversa-badge"), voltar: q("conv-voltar"), titulo: q("conv-titulo"),
    sub: q("conv-sub"), avatar: q("conv-avatar"), lista: q("conv-lista"), chat: q("conv-chat"),
    msgs: q("conv-msgs"), atalhos: q("conv-atalhos"), campo: q("conv-campo"), enviar: q("conv-enviar"),
    rodape: q("conv-rodape"), fechado: q("conv-fechado"),
  };

  let conversas = [];        // [{pessoa_id, clinica_id, clinica_nome}]
  let mensagens = [];        // todas as da conta (as 500 mais recentes)
  let aberta = null;         // {pessoa_id, clinica_id, clinica_nome}
  let assunto = null;
  let timer = null;
  let enviando = false;

  const chave = (p, cl) => p + "|" + cl;
  const daConversa = (cv) => mensagens.filter((m) => m.pessoa_id === cv.pessoa_id && m.clinica_id === cv.clinica_id);
  const naoLidas = (cv) => daConversa(cv).filter((m) => m.de === "clinica" && !m.lida_em).length;

  function iniciais(nome) {
    const p = String(nome || "?").replace(/^(cl[ií]nica|centro|instituto)\s+/i, "").split(/\s+/).filter(Boolean);
    return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  }
  function cor(id) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return CORES[h % CORES.length];
  }
  function hora(iso) {
    try { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return ""; }
  }
  function diaDe(iso) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  }
  function rotuloDia(iso) {
    const d = diaDe(iso), hoje = diaDe(new Date().toISOString());
    const ontem = diaDe(new Date(Date.now() - 86400000).toISOString());
    if (d === hoje) return "Hoje";
    if (d === ontem) return "Ontem";
    return d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4);
  }
  // Na lista: hora se for hoje, "Ontem", ou a data — como o WhatsApp.
  function quandoNaLista(iso) {
    const r = rotuloDia(iso);
    return r === "Hoje" ? hora(iso) : r;
  }
  function nomePessoa(id) {
    try { return nomeDaPessoa(pessoaDe(id)); } catch (e) { return ""; }
  }

  async function carregar() {
    const [rec, msg] = await Promise.all([
      sb.from("recebimentos").select("pessoa_id, clinica_id, clinica_nome, criado_em")
        .is("revogado_em", null).order("criado_em", { ascending: false }),
      sb.from("mensagens")
        .select("id, pessoa_id, clinica_id, clinica_nome, de, assunto, texto, autor, criado_em, entregue_em, lida_em")
        .order("criado_em", { ascending: false }).limit(500),
    ]);
    if (rec.error || msg.error) throw (rec.error || msg.error);
    mensagens = (msg.data || []).reverse();
    const vistas = new Map();
    for (const r of rec.data || []) vistas.set(chave(r.pessoa_id, r.clinica_id), { ...r, ativa: true });
    // Conversa com clínica cujo recebimento foi cancelado: continua legível,
    // mas fechada para escrever.
    for (const m of mensagens) {
      const k = chave(m.pessoa_id, m.clinica_id);
      if (!vistas.has(k)) vistas.set(k, { pessoa_id: m.pessoa_id, clinica_id: m.clinica_id,
                                          clinica_nome: m.clinica_nome, ativa: false });
    }
    conversas = [...vistas.values()];
    const ultima = (cv) => { const l = daConversa(cv); return l.length ? l[l.length - 1].criado_em : (cv.criado_em || ""); };
    conversas.sort((a, b) => String(ultima(b)).localeCompare(String(ultima(a))));
    pintarBadge();
  }

  function pintarBadge() {
    if (!c.badge) return;
    const n = conversas.reduce((s, cv) => s + naoLidas(cv), 0);
    c.badge.textContent = n > 9 ? "9+" : String(n);
    c.badge.classList.toggle("escondido", n === 0);
  }

  function desenharLista() {
    c.titulo.textContent = "Conversas";
    c.sub.textContent = "com a recepção das suas clínicas";
    c.avatar.classList.add("escondido");
    c.chat.classList.add("escondido");
    c.lista.classList.remove("escondido");
    if (!conversas.length) {
      c.lista.innerHTML = `
        <div class="conv-vazio">
          <div class="conv-vazio-ico">💬</div>
          <b>Nenhuma conversa ainda</b>
          <p>Quando a sua clínica usar o indiDoc, ela pede no balcão para enviar seus
          documentos. Depois de você aceitar, é por aqui que você fala com a recepção:
          remarcar, tirar uma dúvida, sem ficar esperando no telefone.</p>
        </div>`;
      return;
    }
    const varias = pessoas.length > 1;
    c.lista.innerHTML = "";
    for (const cv of conversas) {
      const l = daConversa(cv), ult = l[l.length - 1], n = naoLidas(cv);
      const previa = ult ? (ult.de === "paciente" ? "Você: " : "") + ult.texto.replace(/\s+/g, " ") : "Toque para escrever à recepção";
      const linha = document.createElement("button");
      linha.type = "button";
      linha.className = "conv-linha";
      linha.innerHTML = `
        <span class="conv-av" style="background:${cor(cv.clinica_id)}">${escaparHTML(iniciais(cv.clinica_nome))}</span>
        <span class="conv-meio">
          <span class="conv-nome">${escaparHTML(cv.clinica_nome || "Clínica")}${varias ? ` <small>· ${escaparHTML(nomePessoa(cv.pessoa_id))}</small>` : ""}</span>
          <span class="conv-previa${n ? " forte" : ""}">${ult && ult.de === "paciente" ? tique(ult) + " " : ""}${escaparHTML(previa.slice(0, 90))}</span>
        </span>
        <span class="conv-lado">
          <span class="conv-hora${n ? " nova" : ""}">${ult ? quandoNaLista(ult.criado_em) : ""}</span>
          ${n ? `<span class="conv-qtd">${n}</span>` : ""}
        </span>`;
      linha.onclick = () => abrirConversa(cv);
      c.lista.appendChild(linha);
    }
  }

  function tique(m) {
    return m.entregue_em ? '<span class="conv-tq ok" title="Entregue à clínica">✓✓</span>'
                         : '<span class="conv-tq" title="Enviada">✓</span>';
  }

  function desenharConversa(rolar) {
    const cv = aberta;
    const perto = c.msgs.scrollHeight - c.msgs.scrollTop - c.msgs.clientHeight < 80;
    c.titulo.textContent = cv.clinica_nome || "Clínica";
    c.sub.textContent = pessoas.length > 1 ? "sobre " + nomePessoa(cv.pessoa_id) : "Recepção";
    c.avatar.textContent = iniciais(cv.clinica_nome);
    c.avatar.style.background = cor(cv.clinica_id);
    c.avatar.classList.remove("escondido");
    c.lista.classList.add("escondido");
    c.chat.classList.remove("escondido");

    const l = daConversa(cv);
    let html = `<div class="conv-aviso">🔒 Só a recepção da clínica lê esta conversa.
      <b>Não use para urgências</b>: em emergência, ligue 192.</div>`;
    let dia = "";
    for (const m of l) {
      const d = rotuloDia(m.criado_em);
      if (d !== dia) { html += `<div class="conv-dia"><span>${d}</span></div>`; dia = d; }
      const meu = m.de === "paciente";
      html += `<div class="conv-bal ${meu ? "eu" : "ela"}">
        ${!meu && m.autor ? `<div class="conv-autor">${escaparHTML(m.autor)} · Recepção</div>` : ""}
        <div class="conv-txt">${escaparHTML(m.texto).replace(/\n/g, "<br>")}</div>
        <div class="conv-meta">${hora(m.criado_em)}${meu ? " " + tique(m) : ""}</div>
      </div>`;
    }
    if (!l.length) {
      html += `<div class="conv-dica">Escolha um assunto abaixo ou escreva direto.
        A recepção responde no horário de atendimento, e a resposta chega como aviso no celular.</div>`;
    }
    c.msgs.innerHTML = html;
    c.atalhos.classList.toggle("escondido", !cv.ativa);
    c.rodape.classList.toggle("escondido", !cv.ativa);
    c.fechado.classList.toggle("escondido", !!cv.ativa);
    if (rolar || perto) c.msgs.scrollTop = c.msgs.scrollHeight;
  }

  async function marcarLidas(cv) {
    if (!naoLidas(cv)) return;
    const { error } = await sb.rpc("marcar_mensagens_lidas", { p_pessoa: cv.pessoa_id, p_clinica: cv.clinica_id });
    if (!error) {
      const agora = new Date().toISOString();
      for (const m of daConversa(cv)) if (m.de === "clinica" && !m.lida_em) m.lida_em = agora;
      pintarBadge();
    }
  }

  function abrirConversa(cv) {
    aberta = cv;
    assunto = null;
    desenharConversa(true);
    marcarLidas(cv);
    agendar();
  }

  function agendar() {
    clearInterval(timer);
    // Aberta, a conversa se atualiza a cada 10 s; a lista, a cada 30 s.
    timer = setInterval(atualizar, aberta ? 10000 : 30000);
  }

  async function atualizar() {
    if (tela.classList.contains("escondido") || document.hidden) return;
    try {
      await carregar();
      if (aberta) {
        aberta = conversas.find((x) => x.pessoa_id === aberta.pessoa_id && x.clinica_id === aberta.clinica_id) || aberta;
        desenharConversa(false);
        marcarLidas(aberta);
      } else {
        desenharLista();
      }
    } catch (e) { /* sem rede: fica o que está na tela */ }
  }

  async function abrir(pessoaId, clinicaId) {
    tela.classList.remove("escondido");
    c.lista.innerHTML = '<div class="conv-carregando">Carregando…</div>';
    try {
      await carregar();
    } catch (e) {
      c.lista.innerHTML = '<div class="conv-vazio"><b>Sem conexão agora</b><p>As conversas precisam de internet. Tente de novo em instantes.</p></div>';
      return;
    }
    const alvo = pessoaId && conversas.find((x) => x.pessoa_id === pessoaId && x.clinica_id === clinicaId);
    if (alvo) abrirConversa(alvo);
    else { aberta = null; desenharLista(); agendar(); }
  }

  function fechar() {
    clearInterval(timer);
    aberta = null;
    tela.classList.add("escondido");
  }

  c.voltar.onclick = () => {
    if (aberta) { aberta = null; desenharLista(); agendar(); return; }
    fechar();
  };

  for (const [k, a] of Object.entries(ASSUNTOS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "conv-chip";
    b.textContent = a.rotulo;
    b.onclick = () => {
      assunto = k;
      if (!c.campo.value.trim() || Object.values(ASSUNTOS).some((x) => x.texto && c.campo.value === x.texto)) {
        c.campo.value = a.texto;
      }
      ajustarCampo();
      c.campo.focus();
      c.campo.setSelectionRange(c.campo.value.length, c.campo.value.length);
    };
    c.atalhos.appendChild(b);
  }

  function ajustarCampo() {
    c.campo.style.height = "auto";
    c.campo.style.height = Math.min(c.campo.scrollHeight, 120) + "px";
    c.enviar.disabled = !c.campo.value.trim() || enviando;
  }
  c.campo.addEventListener("input", ajustarCampo);

  const ERROS = {
    SEM_RECEBIMENTO: "Esta clínica não está mais autorizada a falar com você. Veja em Mostrar ao médico → Clínicas.",
    LIMITE_DIARIO: "Você já mandou muitas mensagens hoje. A recepção vai responder as que chegaram.",
    TEXTO_LONGO: "A mensagem ficou longa demais. Tente dividir em duas.",
  };
  c.enviar.onclick = async () => {
    const texto = c.campo.value.trim();
    if (!texto || !aberta || enviando) return;
    if (!navigator.onLine) return aviso("Sem conexão agora. A mensagem continua aí; envie quando a internet voltar.", "erro");
    enviando = true;
    ajustarCampo();
    const { error } = await sb.rpc("enviar_mensagem", {
      p_pessoa: aberta.pessoa_id, p_clinica: aberta.clinica_id,
      p_assunto: assunto || (texto.toLowerCase().includes("remarc") ? "remarcar" : "outro"), p_texto: texto,
    });
    enviando = false;
    if (error) {
      const cod = Object.keys(ERROS).find((k) => (error.message || "").includes(k));
      aviso(cod ? ERROS[cod] : "Não consegui enviar agora. Tente de novo.", "erro");
      ajustarCampo();
      return;
    }
    c.campo.value = "";
    assunto = null;
    ajustarCampo();
    try { await carregar(); } catch (e) { /* a mensagem já foi; aparece na próxima atualização */ }
    aberta = conversas.find((x) => x.pessoa_id === aberta.pessoa_id && x.clinica_id === aberta.clinica_id) || aberta;
    desenharConversa(true);
  };
  // Enter envia no computador; no celular o Enter quebra a linha (teclado virtual).
  c.campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); c.enviar.click(); }
  });

  // Botão no cabeçalho, e o voltar do Android fecha a tela (app.js).
  const botao = q("btn-conversa");
  if (botao) botao.onclick = () => abrir();
  if (typeof FECHAR_TELA_CHEIA === "object") FECHAR_TELA_CHEIA["tela-conversa"] = "conv-voltar";

  // Aviso tocado com o app fechado: o service worker abre "#conversa=p,c".
  function pelaUrl() {
    const m = /#conversa=([^&]+)/.exec(location.hash);
    if (!m) return false;
    const [p, cl] = decodeURIComponent(m[1]).split(",");
    history.replaceState(history.state, "", location.pathname + location.search);
    esperarLogin(() => abrir(p, cl));
    return true;
  }
  // A sessão e as pessoas da conta chegam depois de o script rodar.
  function esperarLogin(fn, tentativas = 40) {
    sb.auth.getSession().then(({ data }) => {
      if (data && data.session && pessoas.length) return fn();
      if (tentativas > 0) setTimeout(() => esperarLogin(fn, tentativas - 1), 500);
    });
  }
  // Aviso tocado com o app aberto: o service worker manda uma mensagem.
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      const d = e.data || {};
      if (d.abrir === "conversa") esperarLogin(() => abrir(d.pessoa_id, d.clinica_id));
    });
  }

  // Contador de não lidas no cabeçalho: ao abrir, ao voltar ao app e a cada 2 min.
  function contarNaoLidas() {
    esperarLogin(() => carregar().catch(() => {}), 20);
  }
  pelaUrl();
  contarNaoLidas();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { contarNaoLidas(); atualizar(); } });
  setInterval(() => { if (!document.hidden && tela.classList.contains("escondido")) carregar().catch(() => {}); }, 120000);

  window.Conversa = { abrir };
})();
