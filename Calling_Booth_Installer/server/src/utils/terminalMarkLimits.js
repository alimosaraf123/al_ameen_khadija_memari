function terminalMarkLimits(subject) {
  const rawTheory = subject.theory_marks ?? (subject.mcq_marks == null && subject.oral_marks == null ? subject.full_marks : 0);
  const theory = rawTheory === '' || rawTheory == null ? 0 : Number(rawTheory);
  const oral = subject.oral_marks === '' || subject.oral_marks == null ? 0 : Number(subject.oral_marks);
  const mcq = subject.mcq_marks === '' || subject.mcq_marks == null ? 0 : Number(subject.mcq_marks);

  if (!Number.isFinite(theory) || !Number.isFinite(oral) || !Number.isFinite(mcq)
      || theory < 0 || oral < 0 || mcq < 0) {
    throw new Error('Marks cannot be negative or invalid numbers.');
  }

  const total = theory + oral + mcq;
  if (total <= 0 || total > 999999.99) {
    throw new Error('Enter valid marks (total of Theory, MCQ, and Oral must be greater than zero).');
  }

  return { theory, oral, mcq, total };
}

module.exports = { terminalMarkLimits };
