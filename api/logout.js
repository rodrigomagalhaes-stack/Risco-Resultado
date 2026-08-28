const { clearSession } = require('../lib/session');

module.exports = async (req, res) => {
  clearSession(res);
  res.status(200).json({ ok: true });
};
