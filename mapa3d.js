/* 🧍 Mapa anatômico em 3D (sql/027, 24/10/2026).

   O médico do Indiclin envia o mapa (coração, seios da face, ouvido,
   laringe, olho, fundo de olho, odontograma): a imagem vai como página e os
   dados do desenho na coluna `documentos.mapa`. Aqui o paciente vê o MAIS
   RECENTE de cada especialidade em 3D — os anteriores ficam como imagem.

   O desenho é o mesmo visualizador do Indiclin (mapa3d/coracao.js, cópia
   conferida por teste), em modo paciente: gira, toca na região e lê o
   achado; nada se edita. O three.js (~600 kB) só carrega no primeiro toque
   em "Ver em 3D", e não entra na casca do service worker: sem internet o
   dado do mapa também não vem.

   Carregado DEPOIS de app.js (usa `sb`, `aviso`, `usuario`).            */
(function () {
  const BASE = "./mapa3d/";
  let carregado = null;        // Promise do coracao.js
  let docAberto = null;        // o documento do visualizador
  let dadosAbertos = null;     // os dados do 3D dele (quando é o mais recente)

  const $ = (id) => document.getElementById(id);

  function carregar() {
    if (carregado) return carregado;
    window.__mapaPaciente = true;          // o coracao.js nasce em modo paciente
    carregado = new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = BASE + "coracao.js?v=4";
      s.onload = () => ok();
      s.onerror = () => { carregado = null; falha(new Error("coracao.js")); };
      document.head.appendChild(s);
    });
    return carregado;
  }

  function modeloDe(linha) {
    return (linha && linha.mapa && linha.mapa.modelo) || "";
  }

  /* O mais recente de cada especialidade: pela data do exame, depois pela
     chegada. Pura (exposta para o teste). */
  function maisRecente(linhas, modelo) {
    return linhas.filter((l) => modeloDe(l) === modelo).sort((a, b) =>
      String(b.data_documento || "").localeCompare(String(a.data_documento || ""))
      || String(b.criado_em || "").localeCompare(String(a.criado_em || "")))[0] || null;
  }

  /* Visualizador abriu um documento: se é mapa e o mais recente da
     especialidade, aparece "🧍 Ver em 3D". Banco sem a coluna (027 não
     rodou) ou sem internet: o botão simplesmente não aparece. */
  async function aoAbrir(doc) {
    const bt = $("visu-3d");
    docAberto = doc; dadosAbertos = null;
    if (!bt) return;
    bt.classList.add("escondido");
    if (!doc || doc.tipo !== "mapa" || !doc.pessoa_id) return;
    const { data, error } = await sb.from("documentos")
      .select("id, data_documento, criado_em, mapa")
      .eq("pessoa_id", doc.pessoa_id).eq("tipo", "mapa");
    if (error || !data || docAberto !== doc) return;
    const meu = data.find((l) => l.id === doc.id);
    const modelo = modeloDe(meu);
    if (!modelo || !meu.mapa.catalogo || !meu.mapa.mapa) return;
    const ultimo = maisRecente(data, modelo);
    if (!ultimo || ultimo.id !== doc.id) return;
    dadosAbertos = meu.mapa;
    bt.classList.remove("escondido");
  }

  async function abrir3d() {
    if (!dadosAbertos) return;
    const tela = $("tela-mapa3d");
    $("mapa3d-titulo").textContent = (docAberto && docAberto.nome) || "Mapa anatômico";
    tela.classList.remove("escondido");
    try {
      await carregar();
    } catch (e) {
      tela.classList.add("escondido");
      aviso("Não consegui abrir o desenho em 3D agora. Tente de novo com internet.", "info");
      return;
    }
    window.MapaAnatomico.mostrar({
      paciente_id: (docAberto && docAberto.pessoa_id) || "",
      modelo: dadosAbertos.modelo, catalogo: dadosAbertos.catalogo, mapa: dadosAbertos.mapa,
      plano: dadosAbertos.plano || [],   // 🩺 "Plano combinado com o seu médico" (só as aceitas)
      three: BASE + "three-0.149.0.min.js",
    });
  }

  function fechar3d() {
    $("tela-mapa3d").classList.add("escondido");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const bt = $("visu-3d"), volta = $("mapa3d-fechar");
    if (bt) bt.onclick = abrir3d;
    if (volta) volta.onclick = fechar3d;
  });

  window.Mapa3D = { aoAbrir, maisRecente, fechar: fechar3d };
})();
