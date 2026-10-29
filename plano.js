/* ═══════════════════════════════════════════════════════════════════════
   ⭐ SEU PLANO (sql/029, função `cobranca`, 29/10/2026, aprovado pelo usuário).

     Grátis   2 pessoas e 100 documentos SEUS (o que a clínica envia não conta)
     Família  6 pessoas e 500 documentos — R$ 9,90/mês ou R$ 89,90/ano
     Pacote   +100 documentos para sempre — R$ 19,90, pagamento único

   O pagamento é na página do Asaas (cartão, PIX ou boleto): o app só pede o
   link à função `cobranca` e mostra o botão. Quem libera o plano é o
   webhook, no servidor — nada aqui consegue se dar um plano. Compra só em
   conta com e-mail (na anônima, trocar de celular perderia o que foi pago).

   Carregado depois de app.js (usa `sb`, `usuario`, `consumo`, `lerConsumo`,
   `contaAnonima`, `aviso`, `confirmarModal`, `escaparHTML`, `CONFIG`).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  const q = (id) => document.getElementById(id);
  const caixa = q("conta-plano");
  if (!caixa) return;

  const PRODUTOS = {
    familia_mensal: { titulo: "Família — mensal", preco: "R$ 9,90/mês" },
    familia_anual: { titulo: "Família — anual", preco: "R$ 89,90/ano (25% menos)" },
    pacote_100: { titulo: "+100 documentos", preco: "R$ 19,90, uma vez só" },
  };
  const ERROS = {
    sem_email: "Para assinar, primeiro guarde seu acesso com um e-mail (logo abaixo). "
             + "Assim o que você pagar não se perde se trocar de celular.",
    cpf: "Confira o CPF: ele precisa ser válido para emitir a cobrança.",
    asaas: "O serviço de pagamento recusou agora. Tente de novo em instantes.",
    sem_chave: "O pagamento ainda não está disponível. Tente mais tarde.",
  };
  let escolhido = null;

  const dataBR = (iso) => {
    try { return new Date(iso).toLocaleDateString("pt-BR"); } catch (e) { return ""; }
  };

  function desenhar() {
    const c = consumo || {};
    const familia = c.plano === "familia";
    const extra = c.docs_extra ? ` (inclui +${c.docs_extra} de pacotes)` : "";
    let html = `<h3>⭐ Seu plano: ${familia ? "Família" : "Grátis"}</h3>`
      + `<p><b>${c.documentos ?? 0} de ${c.teto ?? 100}</b> documentos seus${extra}`
      + ` · <b>${c.pessoas ?? 1} de ${c.teto_pessoas ?? 2}</b> pessoas`
      + (c.da_clinica ? `<br>+ ${c.da_clinica} enviados pela clínica, que não contam no limite` : "")
      + "</p>";
    if (familia && c.plano_ate) {
      html += `<p>Vale até <b>${dataBR(c.plano_ate)}</b>`
        + (c.assinatura_ativa ? ", com renovação automática." : " — a renovação está cancelada.") + "</p>";
    }
    const opcoes = familia ? ["pacote_100"] : ["familia_mensal", "familia_anual", "pacote_100"];
    if (familia && !c.assinatura_ativa) opcoes.unshift(c.periodo === "anual" ? "familia_anual" : "familia_mensal");
    html += '<div class="plano-opcoes">' + opcoes.map((k) =>
      `<button type="button" class="btn-linha plano-op" data-produto="${k}" style="width:100%;margin-top:8px">`
      + `<b>${PRODUTOS[k].titulo}</b> · ${PRODUTOS[k].preco}</button>`).join("") + "</div>";
    if (!familia) {
      html += '<p style="font-size:13px;opacity:.75;margin-top:8px">Família: até 6 pessoas e 500 '
        + "documentos. O pacote soma 100 documentos para sempre, sem assinatura.</p>";
    }
    html += '<div id="plano-pagar" class="escondido" style="margin-top:12px">'
      + '<label for="plano-cpf">CPF de quem paga</label>'
      + '<input id="plano-cpf" type="text" inputmode="numeric" maxlength="14" placeholder="000.000.000-00">'
      + '<label for="plano-nome" style="margin-top:8px">Nome completo</label>'
      + `<input id="plano-nome" type="text" maxlength="100" value="${escaparHTML(usuario?.nome || "")}">`
      + '<p style="font-size:12px;opacity:.75;margin:6px 0 0">O CPF vai só para a Asaas, que processa o '
      + "pagamento; não fica guardado no indiDoc.</p>"
      + '<button type="button" class="btn-salvar" id="plano-gerar" style="margin-top:10px">Ir para o pagamento</button>'
      + '<a id="plano-link" class="btn-salvar escondido" target="_blank" rel="noopener" '
      + 'style="display:block;text-align:center;margin-top:10px;text-decoration:none">💳 Pagar agora — cartão, PIX ou boleto</a>'
      + "</div>";
    if (c.assinatura_ativa) {
      html += '<button type="button" class="btn-texto" id="plano-cancelar" style="width:100%;margin-top:8px">'
        + "Cancelar a renovação do Família</button>";
    }
    caixa.innerHTML = html;
    caixa.querySelectorAll(".plano-op").forEach((b) => { b.onclick = () => escolher(b.dataset.produto); });
    const g = q("plano-gerar"); if (g) g.onclick = gerar;
    const x = q("plano-cancelar"); if (x) x.onclick = cancelar;
  }

  function escolher(produto) {
    if (contaAnonima()) { aviso(ERROS.sem_email, "info"); return; }
    escolhido = produto;
    q("plano-pagar").classList.remove("escondido");
    q("plano-link").classList.add("escondido");
    q("plano-gerar").classList.remove("escondido");
    q("plano-gerar").textContent = `Ir para o pagamento — ${PRODUTOS[produto].preco}`;
    q("plano-cpf").focus();
  }

  async function chamar(corpo) {
    const { data: ses } = await sb.auth.getSession();
    const r = await fetch(CONFIG.SUPABASE_URL + "/functions/v1/cobranca", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CONFIG.SUPABASE_ANON_KEY,
                 Authorization: "Bearer " + (ses?.session?.access_token || "") },
      body: JSON.stringify(corpo),
    });
    return r.json().catch(() => ({ ok: false, erro: "falha" }));
  }

  async function gerar() {
    const b = q("plano-gerar");
    b.disabled = true; b.textContent = "Preparando o pagamento…";
    try {
      const d = await chamar({ acao: "comprar", produto: escolhido,
                               cpf: q("plano-cpf").value, nome: q("plano-nome").value });
      if (!d.ok || !d.link) {
        if (d.detalhe) console.warn("[plano]", d.detalhe);
        aviso(ERROS[d.erro] || (d.ja_assinante ? "Você já assina o Família." :
              "Não consegui preparar o pagamento agora. Tente de novo."), "erro");
        b.textContent = "Ir para o pagamento";
        return;
      }
      // Link num botão, e não window.open depois do await: o navegador
      // bloquearia a janela aberta sem o toque do usuário.
      const l = q("plano-link");
      l.href = d.link; l.classList.remove("escondido");
      b.classList.add("escondido");
      aviso("Pronto! Toque em “Pagar agora”. Depois de pago, o plano libera sozinho em instantes.", "ok");
    } finally {
      b.disabled = false;
    }
  }

  async function cancelar() {
    const ok = await confirmarModal(
      "A renovação para, e o que já foi pago vale até o fim do período. Nada é apagado.",
      { titulo: "Cancelar a renovação do Família?", textoConfirmar: "Cancelar renovação", perigo: true });
    if (!ok) return;
    const d = await chamar({ acao: "cancelar" });
    if (!d.ok) { aviso("Não consegui cancelar agora. Tente de novo.", "erro"); return; }
    await lerConsumo();
    desenhar();
    aviso("Renovação cancelada.", "ok");
  }

  // Voltou da página de pagamento: relê o plano (o webhook pode ter liberado).
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && escolhido) {
      await lerConsumo();
      desenhar();
    }
  });

  window.Plano = { desenhar };
})();
