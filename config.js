// Preencha com os dados do projeto Supabase de EXAMES EXTERNOS.
// Settings → API → Project URL e anon public.
//
// A chave anônima é pública por natureza: ela vai no celular de todo paciente.
// Quem protege os dados é o RLS, não o segredo da chave — por isso nenhuma
// política deste banco confia no cliente, e a chave de SERVIÇO nunca entra
// neste arquivo nem em nenhum outro que o navegador baixe.
window.CONFIG = {
  SUPABASE_URL: "https://sxbozpqcirmpfdyfrumw.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4Ym96cHFjaXJtcGZkeWZydW13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1ODQyMzMsImV4cCI6MjEwNTE2MDIzM30.zbVkU9rGZrwGCzt9asfCaWm7KUgUfzDpfGFZOV_9s4k",

  // CAPTCHA no login anônimo. VAZIO = desligado, e o app funciona como
  // sempre. Preenchido, o Supabase passa a exigir o token em toda sessão
  // nova — e é preciso ligar do lado de lá também (Authentication →
  // Attack Protection), senão o login para de funcionar.
  //
  // Cloudflare Turnstile, não hCaptcha: o público aqui tem 70 anos, e
  // quebra-cabeça de imagem com semáforo e ônibus é barreira para quem o
  // app mais quer atender. O Turnstile resolve sozinho na maioria das vezes.
  TURNSTILE_SITE_KEY: "0x4AAAAAAE5uVOs4XBUBL367",

  // Compressão antes de subir. Não é ajuste fino: é o que decide o custo do
  // produto. A 250 KB por imagem, 1 GB guarda ~4.000 documentos; sem comprimir,
  // guarda 285. Mexer nestes números muda a conta do módulo inteiro.
  LADO_MAXIMO: 1600,
  QUALIDADE: 0.75,
};
