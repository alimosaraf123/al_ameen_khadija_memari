BEGIN;
UPDATE subjects SET is_active=FALSE;
INSERT INTO subjects(subject_name,is_active) VALUES
 ('Arabic',TRUE),('Art',TRUE),('Beng',TRUE),('Bio',TRUE),('Chem',TRUE),('Comp',TRUE),
 ('Eng',TRUE),('Eng-I',TRUE),('Eng-II',TRUE),('Geo',TRUE),('Hind',TRUE),('Hist',TRUE),
 ('L.Sc',TRUE),('Math',TRUE),('P.Sc',TRUE),('Phy',TRUE),('Sci',TRUE)
ON CONFLICT(subject_name) DO UPDATE SET is_active=TRUE;
COMMIT;
