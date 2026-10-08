function terminalMarkLimits(subject) {
  const theory = Number(subject.theory_marks ?? subject.full_marks);
  const oral = subject.oral_marks === '' || subject.oral_marks == null ? 0 : Number(subject.oral_marks);
  if (subject.theory_marks === '' || !Number.isFinite(theory) || !Number.isFinite(oral)
      || theory < 0 || oral < 0 || theory + oral <= 0 || theory + oral > 999999.99) {
    throw new Error('Enter valid Theory and Oral marks (total must be greater than zero).');
  }
  return { theory, oral, total: theory + oral };
}
module.exports = { terminalMarkLimits };
