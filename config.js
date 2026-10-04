// Servidor da clínica (endereço e chave pública: não são segredos; os dados estão protegidos por sessão + RLS).
// Cada aparelho só precisa de iniciar sessão uma vez: Definições → Ligação ao servidor.
window.JMC_CONFIG = window.JMC_CONFIG || {
  url: 'https://piudosbhockofrtiieig.supabase.co',
  key: 'sb_publishable_POCYHRzMTQDQPXf8ESnJ_w_I6QDMctw',
  // notificações push (chave pública VAPID; a privada está só no servidor)
  vapid: 'BK-hHGZQ2CwJFDf91ZFDdTWomATirAYK5M2azjFAQnIH1KL5gzUSKq5b2_9oTmZuYpTJP3f6JoEY-_DQxXagNyo'
};
