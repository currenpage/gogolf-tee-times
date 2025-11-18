module.exports = (req, res) => {
  res.status(200).json({ ok: true, message: "Tee time API is alive" });
};