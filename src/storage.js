// Substitui o window.storage disponível apenas dentro dos artifacts do Claude.
// Aqui os dados ficam salvos no localStorage do navegador de cada pessoa —
// ou seja, cada empresa/computador tem seus próprios dados, sem sincronização
// entre dispositivos. Para sincronizar entre dispositivos/usuários no futuro,
// seria necessário um backend real (ex: Supabase, Firebase).

export const storage = {
  async get(key) {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? { key, value } : null;
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
      return { key, value };
    } catch (e) {
      return null;
    }
  },
};
