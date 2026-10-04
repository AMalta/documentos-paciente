/* ═══════════════════════════════════════════════════════════════════════
   CUIDAR JUNTO (sql/024, 04/10/2026, aprovado pelo usuário).

   O acervo de UMA pessoa compartilhado com outra conta — dois irmãos
   cuidando da mesma mãe. Não é conversa entre contas: o que se divide é o
   acervo, nada mais.

     dona      convida (Conta → 👥 Cuidar junto → Convidar), vê quem cuida e
               tira o acesso; é a única que apaga ou edita.
     cuidador  aceita pelo link (#cuidar=CÓDIGO) ou digitando o código; vê,
               guarda exame novo (na pasta e na cota da dona) e gera o código
               do médico. A pessoa aparece nos nomes dele com 🔗.

   Grátis por enquanto (decisão do usuário) e fora do teto de 2 pessoas de
   quem recebe. Carregado depois de app.js (usa `sb`, `usuario`, `pessoas`,
   `compartilhamentos`, `pessoasProprias`, `carregarPessoas`, `carregar`,
   `trocarPessoa`, `desenharContaPessoas`, `confirmarModal`, `aviso`,
   `explicar`, `escaparHTML`, `nomeDaPessoa`, `pessoaDe`, `jaAceitou`, `LINHA`).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const q = (id) => document.getElementById(id);
  const lista = q("cuidar-lista");
  if (!lista) return;
  const CHAVE = "convite-cuidar";

  const quando = (iso) => {
    try {
      return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit",
                                                      hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  };
  const meu = () => (usuario && usuario.id) || "";

  function desenhar() {
    lista.innerHTML = "";
    const cartao = q("conta-cuidar-cartao");
    // Sem o sql/024 a leitura falha e `compartilhamentos` fica vazio; o
    // cartão aparece igual (o convidar avisa o erro), mas não some o que
    // já funciona.
    for (const p of pessoasProprias()) {
      const daPessoa = compartilhamentos.filter((c) => c.pessoa_id === p.id && c.conta_dona === meu());
      const aceitos = daPessoa.filter((c) => c.aceito_em);
      const abertos = daPessoa.filter((c) => !c.aceito_em && c.convite_expira > new Date().toISOString());
      const bloco = document.createElement("div");
      bloco.className = "cuidar-bloco";
      let h = `<div class="cuidar-nome"><b>${escaparHTML(nomeDaPessoa(p))}</b>`
            + `<small>${aceitos.length ? aceitos.length + (aceitos.length === 1 ? " pessoa cuida junto" : " pessoas cuidam junto") : "só você"}</small></div>`;
      for (const c of aceitos) {
        h += `<div class="cuidar-item">👤 ${escaparHTML(c.convidado_nome || "Outra conta")}
               <button type="button" class="btn-texto perigo-txt" data-cuidar="tirar" data-id="${c.id}"
                       data-nome="${escaparHTML(c.convidado_nome || "esta pessoa")}" data-p="${escaparHTML(nomeDaPessoa(p))}">Tirar</button></div>`;
      }
      for (const c of abertos) {
        h += `<div class="cuidar-item cuidar-aberto">✉️ Convite <b>${escaparHTML(c.codigo || "")}</b> · vale até ${quando(c.convite_expira)}
               <span><button type="button" class="btn-texto" data-cuidar="reenviar" data-id="${c.id}">Enviar</button>
               <button type="button" class="btn-texto perigo-txt" data-cuidar="cancelar" data-id="${c.id}">Cancelar</button></span></div>`;
      }
      h += `<button type="button" class="btn-linha cuidar-convidar" data-cuidar="convidar" data-pessoa="${p.id}">
              + Convidar alguém para cuidar ${p.parentesco === "eu" ? "de você" : "de " + escaparHTML(nomeDaPessoa(p))}</button>`;
      bloco.innerHTML = h;
      lista.appendChild(bloco);
    }
    const cuidadas = pessoas.filter((p) => p.compartilhada);
    if (cuidadas.length) {
      const bloco = document.createElement("div");
      bloco.className = "cuidar-bloco";
      let h = `<div class="cuidar-nome"><b>Você cuida junto</b></div>`;
      for (const p of cuidadas) {
        const c = compartilhamentos.find((x) => x.pessoa_id === p.id && x.conta_convidada === meu());
        h += `<div class="cuidar-item">🔗 ${escaparHTML(nomeDaPessoa(p))}
               <small>da conta de ${escaparHTML(p.dona_nome || "outra pessoa")}</small>
               ${c ? `<button type="button" class="btn-texto perigo-txt" data-cuidar="sair" data-id="${c.id}" data-p="${escaparHTML(nomeDaPessoa(p))}">Sair</button>` : ""}</div>`;
      }
      bloco.innerHTML = h;
      lista.appendChild(bloco);
    }
    if (cartao) cartao.classList.toggle("escondido", !usuario);
  }

  async function atualizar() {
    await carregarPessoas();
    await carregar();
    desenharContaPessoas();
  }

  // O texto que vai pelo WhatsApp (ou onde a pessoa escolher). O link abre o
  // app com o convite; o código serve para quem já está com o app aberto.
  function mensagem(c, p) {
    const link = location.origin + location.pathname + "#cuidar=" + c.codigo;
    const quem = p && p.parentesco === "eu" ? "de mim" : "de " + nomeDaPessoa(p);
    return `Quero que você me ajude a cuidar ${quem} no indiDoc: você vai ver os exames, `
      + `guardar os novos e poder mostrar ao médico.` + LINHA + LINHA
      + `Toque para aceitar: ${link}` + LINHA
      + `Ou, no indiDoc, abra Conta → Cuidar junto e digite o código ${c.codigo}.` + LINHA
      + `O convite vale até ${quando(c.convite_expira)}.`;
  }

  async function enviar(c) {
    const p = pessoaDe(c.pessoa_id);
    const texto = mensagem(c, p);
    try {
      if (navigator.share) { await navigator.share({ text: texto }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try {
      await navigator.clipboard.writeText(texto);
      aviso(`Convite copiado. Cole no WhatsApp da pessoa. Código: ${c.codigo}`, "ok");
    } catch (e) {
      aviso(`Mande este código para a pessoa: ${c.codigo}. Ela digita em Conta → Cuidar junto.`, "info");
    }
  }

  async function convidar(pessoaId) {
    if (!navigator.onLine) return aviso("Convidar precisa de internet.", "info", "Sem conexão");
    const p = pessoaDe(pessoaId);
    if (!await confirmarModal(
        `Convidar alguém para cuidar ${p && p.parentesco === "eu" ? "de você" : "de " + nomeDaPessoa(p)}?`
        + LINHA + LINHA + "Quem aceitar vê todos os exames desta pessoa, guarda os novos e "
        + "pode mostrar ao médico. Não apaga nem muda o que já está guardado. Você tira o "
        + "acesso quando quiser.", { textoConfirmar: "Convidar" })) return;
    const { data, error } = await sb.rpc("convidar_cuidador", { p_pessoa: pessoaId });
    if (error) return aviso(explicar(error), "erro");
    const lib = Array.isArray(data) ? data[0] : data;
    await carregarPessoas();
    desenharContaPessoas();
    await enviar({ pessoa_id: pessoaId, codigo: lib.codigo, convite_expira: lib.expira_em });
  }

  async function encerrar(id, pergunta, feito) {
    if (!await confirmarModal(pergunta, { textoConfirmar: "Confirmar", perigo: true })) return;
    const { error } = await sb.rpc("encerrar_compartilhamento", { p_id: id });
    if (error) return aviso(explicar(error), "erro");
    await atualizar();
    aviso(feito, "ok");
  }

  async function aceitar(codigo) {
    codigo = String(codigo || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (codigo.length < 6) return aviso("Digite o código do convite.", "erro");
    if (!navigator.onLine) return aviso("Aceitar o convite precisa de internet.", "info", "Sem conexão");
    const v = await sb.rpc("ver_convite_cuidador", { p_codigo: codigo });
    const info = v.data && (Array.isArray(v.data) ? v.data[0] : v.data);
    if (v.error || !info || !info.valido) {
      return aviso(explicar(v.error || "CONVITE_INVALIDO"), "erro");
    }
    const de = info.dona_nome ? info.dona_nome + " convidou você" : "Você foi convidado(a)";
    if (!await confirmarModal(`${de} para cuidar junto de ${info.pessoa_nome}.` + LINHA + LINHA
        + "Você vai ver os exames, guardar os novos e poder mostrar ao médico. "
        + "Os documentos continuam na conta de quem convidou.",
        { textoConfirmar: "Aceitar", titulo: "Cuidar junto" })) return;
    const { data, error } = await sb.rpc("aceitar_convite_cuidador", { p_codigo: codigo });
    if (error) return aviso(explicar(error), "erro");
    await atualizar();
    if (data) trocarPessoa(data);
    aviso(`Pronto: ${info.pessoa_nome} aparece nos nomes, no alto da tela, com 🔗.`, "ok");
  }

  lista.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cuidar]");
    if (!b) return;
    const acao = b.dataset.cuidar, c = compartilhamentos.find((x) => x.id === b.dataset.id);
    if (acao === "convidar") return convidar(b.dataset.pessoa);
    if (acao === "reenviar" && c) return enviar(c);
    if (acao === "cancelar") return encerrar(b.dataset.id, "Cancelar este convite?", "Convite cancelado.");
    if (acao === "tirar") return encerrar(b.dataset.id,
      `Tirar ${b.dataset.nome} de ${b.dataset.p}?` + LINHA + LINHA
      + "A pessoa deixa de ver os exames na hora. O que ela guardou continua aqui.", "Acesso tirado.");
    if (acao === "sair") return encerrar(b.dataset.id,
      `Deixar de cuidar de ${b.dataset.p}?` + LINHA + LINHA
      + "Os exames continuam na conta de quem convidou.", "Pronto, você saiu.");
  });
  q("cuidar-aceitar").onclick = () => aceitar(q("cuidar-codigo").value)
    .then(() => { q("cuidar-codigo").value = ""; });

  /* Link do convite: guarda o código e espera a conta estar pronta (login,
     termo aceito, nada por cima). Quem ainda não tinha o app cria a conta
     antes; o convite fica guardado até lá. */
  let tentativas = 0;
  function lerLink() {
    const pedido = /#cuidar=([A-Za-z0-9]+)/.exec(location.hash);
    if (!pedido) return false;
    history.replaceState(history.state, "", location.pathname + location.search);
    try { localStorage.setItem(CHAVE, pedido[1]); } catch (e) {}
    return true;
  }
  lerLink();
  /* App já aberto e o link tocado de novo: o navegador só troca o #. */
  window.addEventListener("hashchange", () => {
    if (lerLink()) { tentativas = 0; setTimeout(talvezAceitar, 300); }
  });
  function talvezAceitar() {
    let codigo = null;
    try { codigo = localStorage.getItem(CHAVE); } catch (e) {}
    if (!codigo) return;
    let pronto = false;
    try { pronto = !!usuario && jaAceitou(); } catch (e) {}
    const outra = document.querySelector(".tela-cheia:not(.escondido):not(.como-aba),"
      + "#bemvindo:not(.escondido),#termo:not(.escondido)");
    if (!pronto || outra) {
      if (++tentativas < 600) setTimeout(talvezAceitar, 1000);
      return;
    }
    try { localStorage.removeItem(CHAVE); } catch (e) {}
    aceitar(codigo);
  }
  setTimeout(talvezAceitar, 1500);

  /* "Guardado por João": só com alguém cuidando junto. Leitura à parte, e
     não na lista: sem o sql/024 a coluna não existe e a lista não pode cair. */
  let quemGuardou = new Map();
  async function lerQuemGuardou() {
    if (!usuario || !compartilhamentos.some((c) => c.aceito_em)) { quemGuardou = new Map(); return; }
    const { data, error } = await sb.from("documentos").select("id, paciente_id, guardado_por")
      .not("guardado_por", "is", null);
    if (error) return;
    quemGuardou = new Map((data || []).filter((d) => d.guardado_por !== d.paciente_id)
      .map((d) => [d.id, d.guardado_por]));
  }
  function rotulo(doc) {
    const g = doc && quemGuardou.get(doc.id);
    if (!g) return "";
    if (g === meu()) return "guardado por você";
    const c = compartilhamentos.find((x) => x.conta_convidada === g);
    return "guardado por " + ((c && c.convidado_nome) || "quem cuida junto");
  }

  window.Cuidar = { desenhar, aceitar, lerQuemGuardou, rotulo };
})();
