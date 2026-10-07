/* ═══════════════════════════════════════════════════════════════════════
   DEPOIS DA CONSULTA — o que saiu de cada consulta numa clínica que usa o
   Indiclin, num cartão só, até estar resolvido:

     🧪 Exames pedidos   itens do pedido (`exames_pedidos`, sql/013-014).
                         ✓ sozinho quando o paciente guarda o exame (gatilho
                         no banco); "Já fiz" marca à mão. Exame já na agenda
                         mostra data e local.
     💊 Receita          a receita da clínica do mesmo dia, para abrir.
     📅 Retorno          o próximo compromisso com a clínica; sem ele,
                         "Pedir à clínica" abre a conversa com a mensagem pronta.

   A consulta é reconhecida pelo que a clínica MANDOU (receita, pedido) num
   dia — não pela agenda: consulta marcada e não feita não tem o que
   acompanhar. A agenda só empresta o nome do médico.

   Some quando tudo está feito (exames guardados e retorno marcado), depois
   de 45 dias, ou no ✕. Só lê e mostra; não cria dado novo nenhum.

   Carregado depois de conversa.js e antes de abas.js. Usa `sb`,
   `documentos`, `compromissos`, `pessoas`, `diasAte`, `hojeISO`, `dataBR`,
   `escaparHTML`, `semAcento`, `abrirDocumento`, `aviso`, `trocarPessoa`.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const JANELA = 45;            // dias que o cartão acompanha a consulta
  let pedidos = [];             // exames_pedidos da conta
  let receitas = new Map();     // id do documento → {texto, itens} (sql/021)
  let lidoEm = 0;
  let lendo = null;

  const chaveFora = (v) => "dc-fora-" + v.chave;
  // No início o cartão nasce numa linha só e abre ao tocar: aberto, ocupava a
  // tela inteira de um celular de 360 px e escondia as conversas.
  const abertos = new Set();
  function dispensado(v) { try { return localStorage.getItem(chaveFora(v)) === "1"; } catch (e) { return false; } }
  function dataDoc(d) { return diaDoDocumento(d); }
  const norm = (t) => (typeof semAcento === "function" ? semAcento(String(t || "")) : String(t || "")).toLowerCase();

  async function atualizar(forcar) {
    if (!forcar && Date.now() - lidoEm < 120000) return;
    if (lendo || !navigator.onLine || typeof sb === "undefined") return lendo;
    lendo = (async () => {
      try {
        const { data, error } = await sb.from("exames_pedidos")
          .select("id, item, chave, clinica_id, pessoa_id, documento_id, pedido_em, trazido_em, marcado_manual")
          .gte("pedido_em", somarDiasISO(hojeISO(), -JANELA))
          .order("pedido_em", { ascending: false }).limit(100);
        if (!error) pedidos = data || [];
        const r = await sb.from("documentos").select("id, receita")
          .eq("tipo", "receita").not("receita", "is", null).limit(60);
        if (!r.error) receitas = new Map((r.data || []).map((x) => [x.id, x.receita]));
      } catch (e) { /* sem rede: fica o que tinha */ }
      lidoEm = Date.now();
      lendo = null;
      if (window.Conversa) { Conversa.redesenharInicio(); Conversa.redesenharConversa(); }
    })();
    return lendo;
  }

  function somarDiasISO(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // Uma consulta = pessoa + clínica + dia, com o que a clínica mandou.
  function consultas() {
    const docs = typeof documentos === "undefined" ? [] : documentos;
    const comps = typeof compromissos === "undefined" ? [] : compromissos;
    const limite = somarDiasISO(hojeISO(), -JANELA);
    const mapa = new Map();
    const pegar = (pessoa, clinica, nomeClinica, dia) => {
      const k = pessoa + "|" + clinica + "|" + dia;
      if (!mapa.has(k)) mapa.set(k, { chave: k, pessoa_id: pessoa, clinica_id: clinica,
                                      clinica_nome: nomeClinica || "", dia, receitas: [], pedidos: [] });
      return mapa.get(k);
    };
    for (const d of docs) {
      if (d.origem !== "clinica" || d.apagado || !d.origem_clinica_id) continue;
      const dia = dataDoc(d);
      if (dia < limite || dia > hojeISO()) continue;
      const v = pegar(d.pessoa_id, d.origem_clinica_id, d.origem_clinica_nome, dia);
      if (d.tipo === "receita") v.receitas.push(d);
    }
    for (const p of pedidos) {
      if (p.pedido_em < limite) continue;
      const doc = docs.find((d) => d.id === p.documento_id);
      pegar(p.pessoa_id, p.clinica_id, doc && doc.origem_clinica_nome, p.pedido_em).pedidos.push(p);
    }
    const out = [];
    for (const v of mapa.values()) {
      if (!v.receitas.length && !v.pedidos.length) continue;
      const daClinica = comps.filter((c) => c.origem === "clinica" && c.origem_clinica_id === v.clinica_id
        && !c.apagado && !c.cancelado && (!c.origem_pessoa_id || c.origem_pessoa_id === v.pessoa_id));
      const aquela = daClinica.find((c) => c.quando === v.dia && c.tipo !== "exame");
      v.medico = (aquela && aquela.origem_medico_nome) || "";
      if (!v.clinica_nome) v.clinica_nome = (daClinica[0] && daClinica[0].origem_clinica_nome) || "a clínica";
      v.retorno = daClinica.filter((c) => c.quando > v.dia && c.tipo !== "exame" && !c.feito_em)
        .sort((a, b) => String(a.quando).localeCompare(String(b.quando)))[0] || null;
      v.examesAgendados = daClinica.filter((c) => c.quando > v.dia && c.tipo === "exame" && !c.feito_em);
      const feitos = v.pedidos.filter(feito).length;
      v.total = v.pedidos.length + 1;
      v.feitos = feitos + (v.retorno ? 1 : 0);
      if (v.feitos >= v.total || dispensado(v)) continue;
      out.push(v);
    }
    return out.sort((a, b) => b.dia.localeCompare(a.dia));
  }

  const feito = (p) => !!(p.trazido_em || p.marcado_manual);

  // O exame do pedido que já está na agenda (mesma chave no título).
  function agendado(v, p) {
    const formas = String(p.chave || "").split("|").filter((f) => f.length >= 3);
    return v.examesAgendados.find((c) => {
      const t = " " + norm(c.titulo).replace(/[^a-z0-9]+/g, " ") + " ";
      return formas.some((f) => t.includes(" " + f + " "));
    });
  }

  function quandoTxt(c) {
    return dataBR(c.quando).slice(0, 5) + (c.previsao_hora || c.hora ? ", " + (c.previsao_hora ? "~" + c.previsao_hora : c.hora) : "");
  }

  function html(v, noFio) {
    const quem = pessoas.length > 1 && typeof nomeDaPessoa === "function"
      ? " · " + escaparHTML(nomeDaPessoa(pessoaDe(v.pessoa_id))) : "";
    const sub = [v.medico, dataBR(v.dia).slice(0, 5), noFio ? "" : v.clinica_nome].filter(Boolean).map(escaparHTML).join(" · ");
    const fechado = !noFio && !abertos.has(v.chave);
    let h = `<div class="dc${noFio ? " no-fio" : ""}${fechado ? " fechado" : ""}">
      <div class="dc-cab"${noFio ? "" : ` data-dc="abrir" data-v="${escaparHTML(v.chave)}" role="button" aria-expanded="${!fechado}"`}><div class="dc-tx"><b>📋 Depois da consulta</b><small>${sub}${quem}</small></div>
        <span class="dc-prog">${v.feitos} de ${v.total} feito${v.feitos === 1 ? "" : "s"}</span>
        ${noFio ? "" : `<span class="dc-seta" aria-hidden="true">${fechado ? "▸" : "▾"}</span>`}
        <button type="button" class="dc-x" data-dc="fora" data-v="${escaparHTML(v.chave)}" aria-label="Dispensar">✕</button></div>`;
    if (v.pedidos.length) {
      h += `<div class="dc-sec"><div class="dc-t">🧪 Exames pedidos</div>`;
      for (const p of v.pedidos) {
        const ag = !feito(p) && agendado(v, p);
        h += `<div class="dc-it"><span class="${feito(p) ? "dc-ok" : "dc-pend"}">${feito(p) ? "✓" : "○"}</span>
          <span class="dc-n">${escaparHTML(p.item)}${feito(p)
            ? `<small>${p.marcado_manual ? "feito" : "guardado"}${p.trazido_em ? " em " + dataBR(String(p.trazido_em).slice(0, 10)).slice(0, 5) : ""}</small>`
            : ag ? `<small>marcado · ${escaparHTML(quandoTxt(ag))}</small>` : ""}</span>
          ${feito(p) ? "" : `<button type="button" class="dc-bt forte" data-dc="guardar" data-v="${escaparHTML(v.chave)}">📷 Guardar</button>
            <button type="button" class="dc-bt" data-dc="jafiz" data-p="${escaparHTML(p.id)}">Já fiz</button>`}</div>`;
      }
      h += `</div>`;
    }
    if (v.receitas.length) {
      h += `<div class="dc-sec"><div class="dc-t">💊 Receita</div>`;
      for (const r of v.receitas) {
        h += `<div class="dc-it"><span class="dc-n">${remedios(r)}</span>
          <button type="button" class="dc-bt" data-dc="ver" data-d="${escaparHTML(r.id)}">Ver</button></div>`;
      }
      h += `</div>`;
    }
    h += `<div class="dc-sec"><div class="dc-t">📅 Retorno</div><div class="dc-it">`;
    h += v.retorno
      ? `<span class="dc-ok">✓</span><span class="dc-n">${escaparHTML(dataBR(v.retorno.quando))}${v.retorno.previsao || v.retorno.hora
          ? `<small>${escaparHTML(v.retorno.previsao || "às " + v.retorno.hora)}</small>` : ""}</span>`
      : `<span class="dc-pend">○</span><span class="dc-n">Ainda não marcado</span>
         <button type="button" class="dc-bt forte" data-dc="retorno" data-v="${escaparHTML(v.chave)}">Pedir à clínica</button>`;
    h += `</div></div></div>`;
    return h;
  }

  // Os remédios da receita (sql/021); sem eles, o nome do documento.
  function remedios(r) {
    const rx = receitas.get(r.id);
    const FP = window.FarmaciaPopular;
    if (rx && rx.itens && rx.itens.length) {
      let algum = false;
      const h = rx.itens.map((m) => {
        const gratis = FP && FP.casa(m.nome);
        if (gratis) algum = true;
        return `${escaparHTML(m.nome)}${m.quantidade ? " · " + escaparHTML(m.quantidade) : ""}`
          + (m.posologia ? `<small>${escaparHTML(m.posologia)}</small>` : "")
          + (gratis ? `<span class="dc-fp">💚 Grátis na Farmácia Popular</span>` : "");
      }).join("<br>");
      return h + (algum ? notaFP("") : "");
    }
    const linhas = String((rx && rx.texto) || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (linhas.length) {
      const gratis = FP ? FP.casaTexto(rx.texto) : [];
      return escaparHTML(linhas.slice(0, 3).join(" · ")) + (linhas.length > 3 ? " …" : "")
        + (gratis.length ? notaFP(gratis.join(", ")) : "");
    }
    return escaparHTML(String(r.nome || "Receita").split(" — ")[0]);
  }

  // Como retirar: o que o programa pede no balcão.
  function notaFP(quais) {
    return `<div class="dc-fp-nota">💚 ${quais ? "Grátis na Farmácia Popular: " + escaparHTML(quais) + ". " : ""}`
      + `Leve a receita, um documento com foto e o CPF a uma farmácia com o selo “Aqui Tem Farmácia Popular”.</div>`;
  }

  // Alto das Conversas: as duas consultas mais recentes em aberto. A que o
  // aviso do pedido abriu (sql/025) vem primeiro.
  let foco = "";
  function cartoesInicio() {
    const div = document.createElement("div");
    const lista = consultas();
    const i = foco ? lista.findIndex((v) => v.chave === foco) : -1;
    if (i > 0) lista.unshift(lista.splice(i, 1)[0]);
    div.innerHTML = lista.slice(0, 2).map((v) => html(v, false)).join("");
    return div.children.length ? div : null;
  }
  // No fio da conversa daquela clínica e pessoa: a mais recente.
  function htmlConversa(cv) {
    const v = consultas().find((x) => x.clinica_id === cv.clinica_id && x.pessoa_id === cv.pessoa_id);
    return v ? html(v, true) : "";
  }

  function redesenhar() { if (window.Conversa) { Conversa.redesenharInicio(); Conversa.redesenharConversa(); } }

  async function acao(b) {
    const v = consultas().find((x) => x.chave === b.dataset.v);
    const qual = b.dataset.dc;
    if (qual === "ver") {
      const d = (documentos || []).find((x) => x.id === b.dataset.d);
      if (d) abrirDocumento(d);
      return;
    }
    if (qual === "jafiz") {
      if (!navigator.onLine) return aviso("Marcar como feito precisa de internet.", "info", "Sem conexão");
      const { error } = await sb.from("exames_pedidos")
        .update({ marcado_manual: true, trazido_em: new Date().toISOString() }).eq("id", b.dataset.p);
      if (error) return aviso("Não consegui marcar agora.", "erro");
      await atualizar(true);
      if (typeof carregarPedidos === "function") carregarPedidos();
      return;
    }
    if (!v) return;
    if (qual === "abrir") {
      if (abertos.has(v.chave)) abertos.delete(v.chave); else abertos.add(v.chave);
      return redesenhar();
    }
    if (qual === "fora") {
      try { localStorage.setItem(chaveFora(v), "1"); } catch (e) {}
      return redesenhar();
    }
    if (qual === "guardar") {
      if (typeof trocarPessoa === "function") trocarPessoa(v.pessoa_id);
      if (window.Abas) Abas.ir("documentos");
      document.getElementById("btn-fotografar").click();
      return;
    }
    if (qual === "retorno") {
      await Conversa.abrir(v.pessoa_id, v.clinica_id);
      const campo = document.getElementById("conv-campo");
      if (!campo || campo.closest(".escondido")) return;
      const quem = pessoas.length > 1 && typeof nomeDaPessoa === "function" ? " de " + nomeDaPessoa(pessoaDe(v.pessoa_id)) : "";
      campo.value = `Olá! Gostaria de marcar o retorno${quem}${v.medico ? " com " + v.medico : ""}`
        + ` (consulta de ${dataBR(v.dia).slice(0, 5)}). Quais horários vocês têm?`;
      campo.dispatchEvent(new Event("input", { bubbles: true }));
      campo.focus();
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dc]");
    if (b) { e.stopPropagation(); acao(b); }
  }, true);

  // Toque no aviso "Exames pedidos" (sql/025): o Início com o cartão daquela
  // consulta em primeiro e aberto. Espera o login, como o guia.
  async function abrirPeloAviso(chave, tentativas = 40) {
    let pronto = false;
    try { pronto = !!usuario && jaAceitou(); } catch (e) {}
    if (!pronto) {
      if (tentativas > 0) setTimeout(() => abrirPeloAviso(chave, tentativas - 1), 500);
      return;
    }
    // Quem tocou no aviso quer ver o cartão, mesmo tendo dispensado antes.
    try { localStorage.removeItem("dc-fora-" + chave); } catch (e) {}
    foco = chave;
    abertos.add(chave);
    await atualizar(true);
    if (window.Abas) Abas.ir("inicio"); else redesenhar();
    if (!consultas().some((v) => v.chave === chave)) {
      aviso("Os exames deste pedido já estão marcados como feitos.", "info");
      return;
    }
    const alvo = document.getElementById("ini-depois");
    if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const pedidoAviso = /#pedidos=([^&]+)/.exec(location.hash);
  if (pedidoAviso) {
    history.replaceState(history.state, "", location.pathname + location.search);
    abrirPeloAviso(decodeURIComponent(pedidoAviso[1]));
  }
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      if ((e.data || {}).abrir === "pedidos") abrirPeloAviso(e.data.chave);
    });
  }

  window.DepoisConsulta = { atualizar, cartoesInicio, htmlConversa };
})();
