// zod schema → middleware. body phải đúng schema, ngược lại 400 + field lỗi.
const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Dữ liệu không hợp lệ',
      fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  req.body = parsed.data
  next()
}

module.exports = validate
