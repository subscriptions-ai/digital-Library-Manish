import { officialListDepartment, bodyOf, titleFamilyHits, NON_JOURNAL } from '../src/lib/ingestion/officialListDepartment.js';
let pass = 0, fail = 0;
const t = (name: string, ok: boolean) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? pass++ : fail++; };
const E = 'Electrical Engineering', T = 'Electronics & Telecommunication Engineering', M = 'Mechanical Engineering', A = 'Applied Mechanics';
const IEEE = 'Institute of Electrical and Electronics Engineers (IEEE)', ASME = 'ASME International';
const share = (department: string, s: number, topics = 3) => ({ department, share: s, topics });

// body
t('IEEE, ASME and IET are recognised bodies', bodyOf({ publisher: IEEE })?.id === 'ieee' && bodyOf({ publisher: ASME })?.id === 'asme' && bodyOf({ publisher: 'Institution of Engineering and Technology (IET)' })?.id === 'iet');
t('an ordinary publisher is not a body', bodyOf({ publisher: 'Elsevier BV' }) === null);
t('the Crossref member list a journal came from counts as the body', bodyOf({ publisher: null, listedBy: ['Crossref member ASME International'] })?.id === 'asme');
t('without a body there is no department', officialListDepartment({ title: 'Power Systems Review', publisher: 'Elsevier BV', topicShares: [share(E, 0.9)], topicTotal: 500 }).dept === null);

// the title picks the department inside the family
t('a power-systems title names Electrical, not Electronics', JSON.stringify(titleFamilyHits('IEEE Transactions on Power Systems', [E, T])) === JSON.stringify([E]));
t('a communications title names Electronics & Telecom', JSON.stringify(titleFamilyHits('IEEE Transactions on Communications', [E, T])) === JSON.stringify([T]));
t('a title with words from both families names neither', titleFamilyHits('IEEE Transactions on Power Systems and Communications', [E, T]).length === 2);
t('"Power Electronics" is Electrical only (the bare word electronics names nothing)', JSON.stringify(titleFamilyHits('IEEE Transactions on Power Electronics', [E, T])) === JSON.stringify([E]));
t('a software or neural-network title names neither IEEE department', titleFamilyHits('IEEE Transactions on Neural Networks and Learning Systems', [E, T]).length === 0 && titleFamilyHits('IEEE Transactions on Software Engineering', [E, T]).length === 0);
t('an ASME applied-mechanics title names Applied Mechanics', JSON.stringify(titleFamilyHits('Journal of Applied Mechanics', [M, A])) === JSON.stringify([A]));
t('an ASME heat-transfer title names Mechanical', JSON.stringify(titleFamilyHits('Journal of Heat Transfer', [M, A])) === JSON.stringify([M]));

// all three legs together
const ok = officialListDepartment({ title: 'IEEE Transactions on Antennas and Propagation', publisher: IEEE, topicShares: [share(T, 0.62), share('Physics', 0.1)], topicTotal: 4000 });
t('body + title + topics place a journal', ok.dept === T && ok.confidence === 'high');
t('the shared electrical/electronics subfield counts for the department the title resolves', officialListDepartment({ title: 'IEEE Transactions on Dielectrics and Electrical Insulation', publisher: IEEE, topicShares: [share('AMBIGUOUS_ELECTRICAL', 0.55, 4)], topicTotal: 3000 }).confidence === 'high');
t('a right title with thin topic support is held', officialListDepartment({ title: 'IEEE Transactions on Plasma Science', publisher: IEEE, topicShares: [share(E, 0.12, 1)], topicTotal: 2000 }).confidence === 'low');
t('a right title with no topic data is held', officialListDepartment({ title: 'IEEE Transactions on Plasma Science', publisher: IEEE, topicShares: [], topicTotal: 0 }).confidence === 'low');
t('topics that clearly belong to another department outside the family beat the title', officialListDepartment({ title: 'IEEE Transactions on Smart Grid Analytics', publisher: IEEE, topicShares: [share(E, 0.3, 2), share('Computer / IT', 0.6, 5)], topicTotal: 900 }).confidence === 'low');
t('a title that names neither department is held, whatever the topics', officialListDepartment({ title: 'IEEE Transactions on Cybernetics', publisher: IEEE, topicShares: [share(E, 0.8)], topicTotal: 900 }).dept === null);

t('engineering and physical-science topics together can support a society journal whose own department holds under a third', officialListDepartment({ title: 'IEEE Transactions on Applied Superconductivity', publisher: IEEE, topicShares: [share('Science', 0.32, 4), share('Material Science', 0.2, 3), share(E, 0.16, 4), share('Energy', 0.1, 2)], topicTotal: 3000 }).confidence === 'high');
t('the same title is held when computing leads the topics', officialListDepartment({ title: 'IEEE Signal Processing Letters', publisher: IEEE, topicShares: [share('Computer / IT', 0.7, 5), share(T, 0.2, 3)], topicTotal: 3000 }).confidence === 'low');
t('a few engineering topics are not "broad engineering" support', officialListDepartment({ title: 'IEEE Transactions on Plasma Science', publisher: IEEE, topicShares: [share('Science', 0.5, 2), share('Medical Sciences', 0.3, 2)], topicTotal: 3000 }).confidence === 'low');

// second run: Japanese/Korean electrical societies, Optica, and the biotechnology societies
t('IEEJ, KIEE, Optica, KSBB and JSBBA are recognised bodies', ['Institute of Electrical Engineers of Japan (IEE Japan)', 'The Korean Institute of Electrical Engineers', 'Optica Publishing Group', 'Korean Society for Biotechnology and Bioengineering', 'Japan Society for Bioscience, Biotechnology, and Agrochemistry'].every(p => bodyOf({ publisher: p }) !== null));
t('a biotechnology society journal needs a biotechnology term in its title: "Bioprocess" yes, "Cell Reports" no', titleFamilyHits('Journal of Bioscience and Bioengineering', ['Bio Technology']).length === 1 && titleFamilyHits('Cell Reports', ['Bio Technology']).length === 0);
t('a society journal with a biotechnology title and engineering-free topics is placed on its own department share', officialListDepartment({ title: 'Biotechnology and Bioprocess Engineering', publisher: 'Korean Society for Biotechnology and Bioengineering', topicShares: [share('Bio Technology', 0.55, 4)], topicTotal: 800 }).dept === 'Bio Technology');

// non-journals
t('magazines, newsletters, proceedings and standards are never journals', ['IEEE Power and Energy Magazine', 'IEEE Communications Magazine', 'Proceedings of the IEEE Conference on Power', 'IEEE Standards Newsletter'].every(x => NON_JOURNAL.test(x)));
t('a magazine from a recognised body is held', officialListDepartment({ title: 'IEEE Industry Applications Magazine', publisher: IEEE, topicShares: [share(E, 0.7)], topicTotal: 900 }).dept === null);
t('an ordinary journal title is not matched as a non-journal', !NON_JOURNAL.test('IEEE Transactions on Power Systems') && !NON_JOURNAL.test('Journal of Applied Mechanics'));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
