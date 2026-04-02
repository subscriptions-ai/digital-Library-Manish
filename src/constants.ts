import { Domain, Journal, SubscriptionPlan, ContentType, ContentTypeInfo } from "./types";

export const CONTENT_TYPES: ContentType[] = [
  { id: "books", name: "Books", icon: "Book", description: "Textbooks, reference materials, and specialized e-books." },
  { id: "periodicals", name: "Periodicals", icon: "Newspaper", description: "Peer-reviewed technical journals and academic bulletins." },
  { id: "magazines", name: "Magazines", icon: "BookOpen", description: "Academic and subject-focused issues for broader perspectives." },
  { id: "case-reports", name: "Case Reports", icon: "FileText", description: "Detailed clinical, engineering, and legal case studies." },
  { id: "theses", name: "Theses", icon: "GraduationCap", description: "Original UG, PG, and PhD research work and dissertations." },
  { id: "proceedings", name: "Conference Proceedings", icon: "Users", description: "Papers from national and international academic conferences." },
  { id: "videos", name: "Educational Videos", icon: "Video", description: "Expert lectures, tutorials, and academic webinars." },
  { id: "newsletters", name: "Newsletters", icon: "Mail", description: "Regular institutional and departmental research updates." },
];

const DEFAULT_CONTENT_TYPES: ContentTypeInfo[] = [
  { type: "Books", count: "500+", description: "Core textbooks and reference materials." },
  { type: "Periodicals", count: "1,200+", description: "High-impact technical journals." },
  { type: "Magazines", count: "200+", description: "Subject-focused academic issues." },
  { type: "Case Reports", count: "5,000+", description: "Real-world research applications." },
  { type: "Theses", count: "10,000+", description: "Original research repository." },
  { type: "Proceedings", count: "3,000+", description: "Global conference insights." },
  { type: "Videos", count: "1,500+", description: "Visual learning resources." },
  { type: "Newsletters", count: "800+", description: "Departmental updates." },
];

export const DOMAINS: Domain[] = [
  {
    id: "electrical-engineering",
    name: "Electrical Engineering",
    description: "Electrical Engineering is a core branch of engineering that deals with the study, design, and application of equipment, devices, and systems which use electricity, electronics, and electromagnetism. It covers a wide spectrum from power generation and distribution to telecommunications and control systems.",
    importance: "In the modern era, Electrical Engineering is indispensable. It powers our homes, drives industrial automation, enables global communication networks, and is at the heart of the renewable energy revolution and electric mobility. Research in this field is critical for achieving global sustainability goals and advancing technological frontiers.",
    contentAvailable: ["60+ Specialized Journals", "20,000+ Technical Papers", "Interactive Simulations", "Expert Webinars"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Subscribing to our Electrical Engineering library provides you with peer-reviewed research that is shaping the future of power grids, semiconductor technology, and signal processing. Stay ahead in a rapidly evolving field with access to the latest breakthroughs and industry standards.",
    whoShouldSubscribe: ["Undergraduate & Postgraduate Students", "Power Systems Researchers", "Electronics Design Engineers", "Academic Libraries", "Energy Sector Corporates"],
    features: ["Full-text Journal Access", "Downloadable E-Books", "High-Quality Video Tutorials", "Conference Paper Repository", "Monthly Research Newsletters"],
    icon: "Zap",
    themeColor: "blue"
  },
  {
    id: "computer-it",
    name: "Computer / IT",
    description: "Computer Science and Information Technology involve the theoretical study of algorithms and data structures, and the practical application of computing systems to solve complex problems. This domain includes Artificial Intelligence, Cybersecurity, Software Engineering, and Data Science.",
    importance: "Digital transformation is the defining trend of the 21st century. Computer Science research drives innovation in every sector, from healthcare to finance. Understanding AI, Big Data, and Cloud Computing is essential for any modern institution or professional aiming to lead in the digital economy.",
    contentAvailable: ["100+ High-Impact Journals", "35,000+ Conference Proceedings", "Software Documentation", "Coding Masterclasses"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Our digital library offers unparalleled access to the latest research in Deep Learning, Blockchain, and Cyber-Physical Systems. A subscription ensures your researchers and students have the tools to innovate and excel in the global tech landscape.",
    whoShouldSubscribe: ["CS & IT Students", "Software Developers", "AI Researchers", "Tech Startups", "University IT Departments"],
    features: ["Access to Top-Tier Journals", "Latest Tech E-Books", "Programming Video Series", "Global Conference Papers", "Industry Trend Reports"],
    icon: "Monitor",
    themeColor: "indigo"
  },
  {
    id: "medical-sciences",
    name: "Medical Sciences",
    description: "Medical Sciences encompass a vast array of disciplines dedicated to understanding human health, diagnosing diseases, and developing effective treatments. It includes clinical medicine, pharmacology, public health, and biomedical research.",
    importance: "Medical research is the foundation of modern healthcare. It leads to life-saving discoveries, informs public health policies, and improves the quality of life globally. Access to the latest clinical trials and case reports is vital for medical practitioners and researchers.",
    contentAvailable: ["150+ Peer-Reviewed Journals", "Clinical Case Studies", "Surgical Procedure Videos", "Medical Reference E-Books"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Stay updated with evidence-based medicine and the latest pharmacological advancements. Our library provides the critical data needed for clinical decision-making and cutting-edge biomedical research.",
    whoShouldSubscribe: ["Medical Students & Interns", "Practicing Physicians", "Biomedical Researchers", "Hospital Libraries", "Pharmaceutical Companies"],
    features: ["Clinical Journal Access", "Medical Case Report Database", "Surgical Video Library", "Reference Textbooks", "Health Policy Newsletters"],
    icon: "Stethoscope",
    themeColor: "red"
  },
  {
    id: "management",
    name: "Management",
    description: "Management is the art and science of organizing resources and directing activities to achieve organizational goals. It covers strategic planning, human resources, finance, marketing, and operations management.",
    importance: "Effective management is crucial for the success of any organization. Research in management provides insights into leadership, organizational behavior, and market dynamics, helping businesses navigate a complex and competitive global environment.",
    contentAvailable: ["50+ Business Journals", "Market Research Reports", "Leadership Case Studies", "Executive Education Videos"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Access the latest theories and case studies in digital transformation, sustainable business practices, and global leadership. Empower your team with the knowledge to drive organizational growth.",
    whoShouldSubscribe: ["MBA & BBA Students", "Corporate Managers", "Business Consultants", "Entrepreneurship Hubs", "Management Institutes"],
    features: ["Business Journal Access", "Strategic Management E-Books", "Leadership Video Series", "Market Analysis Reports", "Corporate Newsletters"],
    icon: "Briefcase",
    themeColor: "slate"
  },
  {
    id: "chemistry",
    name: "Chemistry",
    description: "Chemistry is the study of matter, its properties, how and why substances combine or separate to form other substances, and how substances interact with energy. It is often called the central science because it bridges other natural sciences.",
    importance: "Chemical research is fundamental to the development of new materials, medicines, and sustainable energy sources. From nanotechnology to environmental science, chemistry plays a pivotal role in solving global challenges.",
    contentAvailable: ["70+ Specialized Journals", "Laboratory Protocols", "Chemical Safety Reports", "Molecular Modeling Videos"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Gain access to high-impact research in organic, inorganic, and analytical chemistry. Our library supports laboratory breakthroughs and industrial chemical applications with reliable, peer-reviewed data.",
    whoShouldSubscribe: ["Chemistry Students", "Industrial Chemists", "Pharmacologists", "Research Laboratories", "Science Faculties"],
    features: ["Chemistry Journal Access", "Advanced E-Books", "Lab Tutorial Videos", "Research Theses", "Safety & Regulatory Updates"],
    icon: "Beaker",
    themeColor: "emerald"
  },
  {
    id: "mechanical-engineering",
    name: "Mechanical Engineering",
    description: "Mechanical Engineering is one of the oldest and broadest engineering branches. It involves the design, analysis, manufacturing, and maintenance of mechanical systems, ranging from small individual parts to large systems like aircraft and spacecraft.",
    importance: "Mechanical engineering is the backbone of the manufacturing and transportation industries. Research in robotics, thermodynamics, and materials science is essential for the next generation of industrial automation and sustainable transport.",
    contentAvailable: ["55+ Engineering Journals", "Design Standards", "CAD/CAM Tutorials", "Manufacturing Case Studies"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Stay informed about the latest advancements in additive manufacturing, fluid dynamics, and mechatronics. Our library provides the technical depth required for innovative engineering solutions.",
    whoShouldSubscribe: ["Engineering Students", "Mechanical Designers", "Robotics Engineers", "Manufacturing Firms", "Technical Universities"],
    features: ["Engineering Journal Access", "Technical E-Books", "Design Video Tutorials", "Conference Proceedings", "Industry Standards Updates"],
    icon: "Settings",
    themeColor: "orange"
  },
  {
    id: "pharmacy",
    name: "Pharmacy",
    description: "Pharmacy is the health science that links medical science with chemistry and it is charged with the discovery, production, control, disposal, safe and effective use of drugs.",
    importance: "The pharmaceutical sector is critical for global health. Continuous research is needed to develop new vaccines, manage chronic diseases, and ensure drug safety through rigorous clinical trials and pharmacological studies.",
    contentAvailable: ["40+ Pharma Journals", "Drug Interaction Guides", "Clinical Trial Reports", "Pharmacology Videos"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Access the latest research in drug delivery systems, clinical pharmacy, and medicinal chemistry. Our library is an essential resource for staying compliant with global pharmaceutical standards.",
    whoShouldSubscribe: ["Pharmacy Students", "Pharmacists", "Drug Researchers", "Pharmaceutical Corporates", "Pharmacy Colleges"],
    features: ["Pharma Journal Access", "Pharmacology E-Books", "Clinical Case Reports", "Research Theses", "Regulatory Newsletters"],
    icon: "Pill",
    themeColor: "pink"
  },
  {
    id: "civil-construction",
    name: "Civil / Construction Engineering",
    description: "Civil Engineering is a professional engineering discipline that deals with the design, construction, and maintenance of the physical and naturally built environment, including works like roads, bridges, canals, dams, and buildings.",
    importance: "As urbanization accelerates, civil engineering research is vital for creating sustainable, resilient, and smart infrastructure. Innovations in materials and construction techniques are key to building the cities of the future.",
    contentAvailable: ["35+ Infrastructure Journals", "Building Codes & Standards", "Structural Analysis Reports", "Construction Site Videos"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Unlock research on green building, earthquake engineering, and smart city planning. Our library provides the foundational knowledge for modern infrastructure development.",
    whoShouldSubscribe: ["Civil Engineering Students", "Structural Engineers", "Urban Planners", "Construction Companies", "Government Infrastructure Bodies"],
    features: ["Civil Journal Access", "Infrastructure E-Books", "Site Safety Videos", "Conference Papers", "Urban Planning Reports"],
    icon: "Building",
    themeColor: "amber"
  },
  {
    id: "nano-technology",
    name: "Nano Technology",
    description: "Nanotechnology is the manipulation of matter on an atomic, molecular, and supramolecular scale. It involves the design, characterization, production, and application of structures, devices, and systems by controlling shape and size at nanometer scale.",
    importance: "Nanotechnology is a transformative field with applications in medicine, electronics, energy, and materials science. It allows for the creation of stronger, lighter, and more efficient products, driving the next industrial revolution.",
    contentAvailable: ["25+ Nano Journals", "Nanomaterial Databases", "Scanning Microscopy Videos", "Nano-Bio Research Papers"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Access pioneering research in carbon nanotubes, quantum dots, and nanomedicine. Stay at the cutting edge of a field that is redefining the limits of science and engineering.",
    whoShouldSubscribe: ["Nanotechnology Students", "Material Scientists", "Biomedical Engineers", "Advanced Research Labs", "Tech Corporates"],
    features: ["Nano Journal Access", "Advanced Materials E-Books", "Microscopy Video Tutorials", "Research Theses", "Nano-Tech Newsletters"],
    icon: "Microscope",
    themeColor: "indigo"
  },
  {
    id: "bio-technology",
    name: "Bio Technology",
    description: "Biotechnology is the use of living systems and organisms to develop or make products, or 'any technological application that uses biological systems, living organisms, or derivatives thereof, to make or modify products or processes for specific use'.",
    importance: "Biotechnology is at the forefront of solving global issues in healthcare, agriculture, and the environment. From gene editing to biofuels, biotech research is essential for a sustainable and healthy future.",
    contentAvailable: ["45+ Biotech Journals", "Genomic Data Reports", "Lab Technique Videos", "Bioprocess Engineering Papers"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Explore the latest in CRISPR technology, synthetic biology, and agricultural biotechnology. Our library provides the biological insights needed for groundbreaking innovation.",
    whoShouldSubscribe: ["Biotech Students", "Geneticists", "Agricultural Scientists", "Biotech Startups", "Life Science Departments"],
    features: ["Biotech Journal Access", "Molecular Biology E-Books", "Lab Protocol Videos", "Conference Proceedings", "Biotech Industry Updates"],
    icon: "Dna",
    themeColor: "emerald"
  },
  {
    id: "energy",
    name: "Energy",
    description: "The Energy domain focuses on the production, distribution, and consumption of energy. It covers traditional fossil fuels as well as renewable sources like solar, wind, and nuclear energy, along with energy storage and efficiency.",
    importance: "Energy is the lifeblood of modern civilization. Transitioning to clean energy and improving energy efficiency are the most critical challenges of our time. Research in this field is vital for energy security and climate action.",
    contentAvailable: ["30+ Energy Journals", "Renewable Energy Reports", "Power Plant Simulation Videos", "Energy Policy Papers"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Stay updated on the latest in battery technology, solar cell efficiency, and smart grid integration. Our library is a key resource for energy professionals and researchers.",
    whoShouldSubscribe: ["Energy Engineering Students", "Renewable Energy Consultants", "Power Plant Operators", "Environmental NGOs", "Energy Sector Corporates"],
    features: ["Energy Journal Access", "Renewable Energy E-Books", "Technical Video Lectures", "Research Theses", "Energy Policy Newsletters"],
    icon: "Flame",
    themeColor: "orange"
  },
  {
    id: "life-sciences",
    name: "Life Sciences",
    description: "Life Sciences involve the scientific study of living organisms – such as microorganisms, plants, animals, and human beings – as well as related considerations like bioethics.",
    importance: "Life sciences research is fundamental to our understanding of the natural world and our own biology. It informs conservation efforts, agricultural practices, and medical breakthroughs.",
    contentAvailable: ["50+ Life Science Journals", "Biodiversity Reports", "Field Study Videos", "Biological Classification Guides"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Access comprehensive research in ecology, zoology, botany, and microbiology. Our library supports a deep understanding of the complex systems that sustain life on Earth.",
    whoShouldSubscribe: ["Biology Students", "Ecologists", "Microbiologists", "Conservationists", "Natural History Museums"],
    features: ["Life Science Journal Access", "Biological E-Books", "Nature Documentary Videos", "Research Theses", "Environmental Newsletters"],
    icon: "Leaf",
    themeColor: "green"
  },
  {
    id: "law",
    name: "Law",
    description: "Law is a system of rules created and enforced through social or governmental institutions to regulate behavior. It encompasses constitutional law, criminal law, international law, and corporate law.",
    importance: "Legal research is essential for the administration of justice, the protection of rights, and the functioning of a civil society. Understanding legal precedents and evolving regulations is critical for legal professionals.",
    contentAvailable: ["25+ Law Journals", "Legal Case Reports", "Court Proceeding Videos", "Constitutional Commentaries"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Access a vast repository of legal case studies, international treaties, and scholarly legal analysis. Stay informed about the latest judicial interpretations and legislative changes.",
    whoShouldSubscribe: ["Law Students", "Advocates & Judges", "Legal Scholars", "Corporate Legal Departments", "Law Firms"],
    features: ["Legal Journal Access", "Law Reference E-Books", "Mock Trial Videos", "Legal Research Theses", "Legislative Update Newsletters"],
    icon: "Gavel",
    themeColor: "slate"
  },
  {
    id: "agriculture",
    name: "Agriculture",
    description: "Agriculture is the science and art of cultivating plants and livestock. It includes crop production, soil science, animal husbandry, and agricultural economics.",
    importance: "Agriculture is the foundation of food security. Research in sustainable farming, pest management, and crop genetics is vital for feeding a growing global population while protecting the environment.",
    contentAvailable: ["35+ Agricultural Journals", "Soil Analysis Reports", "Farming Technique Videos", "Agri-Business Case Studies"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Explore the latest in precision agriculture, organic farming, and climate-resilient crops. Our library provides the knowledge to transform traditional farming into a high-tech industry.",
    whoShouldSubscribe: ["Agriculture Students", "Agronomists", "Farmers & Agri-Entrepreneurs", "Agricultural Research Centers", "Agri-Input Companies"],
    features: ["Agri Journal Access", "Soil Science E-Books", "Farming Video Tutorials", "Research Theses", "Market Trend Newsletters"],
    icon: "Wheat",
    themeColor: "amber"
  },
  {
    id: "nursing",
    name: "Nursing",
    description: "Nursing is a profession within the healthcare sector focused on the care of individuals, families, and communities so they may attain, maintain, or recover optimal health and quality of life.",
    importance: "Nurses are the backbone of healthcare delivery. Research in nursing practice, patient care, and healthcare management is essential for improving patient outcomes and healthcare efficiency.",
    contentAvailable: ["30+ Nursing Journals", "Patient Care Protocols", "Clinical Skill Videos", "Nursing Ethics Reports"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Stay updated with the latest in evidence-based nursing practice and patient safety. Our library supports the professional development of nurses and the excellence of healthcare institutions.",
    whoShouldSubscribe: ["Nursing Students", "Registered Nurses", "Nurse Educators", "Nursing Colleges", "Hospital Administration"],
    features: ["Nursing Journal Access", "Clinical E-Books", "Skill Demonstration Videos", "Research Theses", "Nursing Practice Newsletters"],
    icon: "HeartPulse",
    themeColor: "rose"
  },
  {
    id: "education-social-sciences",
    name: "Education and Social Sciences",
    description: "This domain explores the processes of learning and the complex structures of human society. It includes pedagogy, sociology, psychology, and educational technology.",
    importance: "Education and social sciences research is key to understanding human behavior and improving societal structures. It informs educational policy, social welfare programs, and our understanding of cultural dynamics.",
    contentAvailable: ["40+ Education Journals", "Sociological Reports", "Psychological Case Studies", "Pedagogical Video Series"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Access research on inclusive education, digital learning, and social policy. Our library provides the insights needed to build a more equitable and informed society.",
    whoShouldSubscribe: ["Education Students", "Teachers & Educators", "Sociologists", "Policy Makers", "Social Work Organizations"],
    features: ["Education Journal Access", "Social Science E-Books", "Teaching Method Videos", "Research Theses", "Educational Trend Newsletters"],
    icon: "GraduationCap",
    themeColor: "purple"
  },
  {
    id: "applied-sciences",
    name: "Applied Sciences",
    description: "Applied Sciences involve the application of existing scientific knowledge to practical applications, like technology or inventions. It bridges the gap between theoretical science and engineering.",
    importance: "Applied science is the engine of practical innovation. It takes discoveries from the lab and turns them into products and processes that improve our daily lives.",
    contentAvailable: ["45+ Applied Science Journals", "Patent Reports", "Experimental Technique Videos", "Industrial Application Papers"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Unlock research in forensic science, environmental technology, and applied physics. Our library supports the practical application of scientific principles across various industries.",
    whoShouldSubscribe: ["Applied Science Students", "Industrial Researchers", "Forensic Experts", "Innovation Hubs", "Technical Departments"],
    features: ["Applied Science Journal Access", "Technical E-Books", "Experimental Video Tutorials", "Research Theses", "Innovation Newsletters"],
    icon: "FlaskConical",
    themeColor: "cyan"
  },
  {
    id: "multidisciplinary",
    name: "Multidisciplinary",
    description: "Multidisciplinary research involves the combination of several professional specializations or academic disciplines to solve complex problems that cannot be addressed by a single field.",
    importance: "The most significant challenges of our time – like climate change and global pandemics – require multidisciplinary solutions. This domain fosters collaboration and the integration of diverse perspectives.",
    contentAvailable: ["50+ Multidisciplinary Journals", "Interdisciplinary Reports", "Collaborative Research Videos", "Cross-Domain Case Studies"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Access a broad range of research that transcends traditional boundaries. Our library is the perfect resource for researchers looking to expand their horizons and find innovative solutions.",
    whoShouldSubscribe: ["Interdisciplinary Researchers", "General Science Students", "Academic Libraries", "Think Tanks", "Global Organizations"],
    features: ["Multidisciplinary Journal Access", "Broad-Spectrum E-Books", "Collaborative Video Series", "Research Theses", "Global Research Newsletters"],
    icon: "Layers",
    themeColor: "violet"
  },
  {
    id: "electronics-telecommunication",
    name: "Electronics & Telecommunication Engineering",
    description: "This field deals with the design and development of electronic circuits, equipment, and communication systems. It includes 5G technology, satellite communication, and embedded systems.",
    importance: "In a hyper-connected world, telecommunications research is the foundation of global connectivity. It enables high-speed internet, mobile communication, and the Internet of Things (IoT).",
    contentAvailable: ["40+ Telecom Journals", "Signal Processing Reports", "Antenna Design Videos", "Wireless Network Papers"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Stay at the forefront of wireless communication, optical fiber technology, and VLSI design. Our library provides the technical depth for the next generation of communication systems.",
    whoShouldSubscribe: ["Engineering Students", "Telecom Engineers", "Network Architects", "Telecom Corporates", "Technical Institutes"],
    features: ["Telecom Journal Access", "Electronics E-Books", "Technical Video Tutorials", "Conference Proceedings", "Telecom Industry Newsletters"],
    icon: "Radio",
    themeColor: "sky"
  },
  {
    id: "chemical-engineering",
    name: "Chemical Engineering",
    description: "Chemical Engineering is a branch of engineering that uses principles of chemistry, physics, mathematics, biology, and economics to efficiently use, produce, design, transport and transform energy and materials.",
    importance: "Chemical engineers are essential for the production of everything from fuels to food. Research in this field is key to sustainable manufacturing and the development of green chemical processes.",
    contentAvailable: ["35+ Chem-Eng Journals", "Process Design Reports", "Plant Operation Videos", "Safety Standards Papers"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Access research on process intensification, biochemical engineering, and sustainable materials. Our library supports the optimization of industrial chemical processes.",
    whoShouldSubscribe: ["Chemical Engineering Students", "Process Engineers", "Plant Managers", "Chemical Corporates", "Engineering Departments"],
    features: ["Chem-Eng Journal Access", "Process Engineering E-Books", "Plant Safety Videos", "Research Theses", "Industrial Newsletters"],
    icon: "FlaskRound",
    themeColor: "teal"
  },
  {
    id: "ayurveda",
    name: "Ayurveda",
    description: "Ayurveda is one of the world's oldest holistic healing systems. It was developed more than 3,000 years ago in India. It’s based on the belief that health and wellness depend on a delicate balance between the mind, body, and spirit.",
    importance: "Ayurvedic research is vital for validating traditional knowledge with modern scientific methods. It offers alternative and complementary approaches to health and wellness that are gaining global recognition.",
    contentAvailable: ["20+ Ayurveda Journals", "Herbal Medicine Reports", "Panchakarma Technique Videos", "Ancient Text Commentaries"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Explore the scientific basis of Ayurvedic treatments and herbal pharmacology. Our library is a unique resource for integrating traditional wisdom with modern healthcare.",
    whoShouldSubscribe: ["Ayurveda Students (BAMS/MD)", "Ayurvedic Practitioners", "Herbal Researchers", "Wellness Centers", "Ayurvedic Colleges"],
    features: ["Ayurveda Journal Access", "Traditional Medicine E-Books", "Treatment Video Tutorials", "Research Theses", "Wellness Newsletters"],
    icon: "Sprout",
    themeColor: "lime"
  },
  {
    id: "architecture",
    name: "Architecture",
    description: "Architecture is both the process and the product of planning, designing, and constructing buildings or other structures. It is a multidisciplinary field that combines art, science, and technology.",
    importance: "Architecture shapes the environment we live in. Research in sustainable design, urban planning, and architectural history is essential for creating functional, beautiful, and eco-friendly spaces.",
    contentAvailable: ["25+ Architecture Journals", "Design Portfolios", "Architectural Walkthrough Videos", "Urban Planning Reports"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Access research on green architecture, parametric design, and heritage conservation. Our library provides the inspiration and technical knowledge for modern architectural practice.",
    whoShouldSubscribe: ["Architecture Students", "Architects", "Interior Designers", "Urban Planners", "Architecture Firms"],
    features: ["Architecture Journal Access", "Design E-Books", "Walkthrough Video Series", "Conference Proceedings", "Design Trend Newsletters"],
    icon: "Compass",
    themeColor: "stone"
  },
  {
    id: "material-science",
    name: "Material Science",
    description: "Material Science is an interdisciplinary field involving the properties of matter and its applications to various areas of science and engineering. It investigates the relationship between the structure of materials at atomic or molecular scales and their macroscopic properties.",
    importance: "Material science is the foundation of technological progress. From semiconductors to aerospace alloys, new materials drive innovation in every engineering field.",
    contentAvailable: ["30+ Material Science Journals", "Material Property Databases", "Microscopy Videos", "Metallurgy Reports"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Stay updated on the latest in polymers, ceramics, and composite materials. Our library provides the structural insights needed to engineer the next generation of high-performance materials.",
    whoShouldSubscribe: ["Material Science Students", "Metallurgists", "Aerospace Engineers", "Research Labs", "Manufacturing Corporates"],
    features: ["Material Science Journal Access", "Metallurgy E-Books", "Lab Technique Videos", "Research Theses", "Material Trend Newsletters"],
    icon: "Box",
    themeColor: "zinc"
  },
  {
    id: "applied-mechanics",
    name: "Applied Mechanics",
    description: "Applied Mechanics is a branch of the physical sciences and the practical application of mechanics. It examines the response of bodies or systems of bodies to external forces.",
    importance: "Applied mechanics is fundamental to structural engineering, mechanical design, and aerospace. It provides the mathematical and physical models needed to predict the behavior of complex systems.",
    contentAvailable: ["20+ Mechanics Journals", "Structural Simulation Reports", "Dynamics Video Lectures", "Finite Element Analysis Papers"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Access research on computational mechanics, fracture mechanics, and biomechanics. Our library provides the analytical depth required for advanced engineering research.",
    whoShouldSubscribe: ["Engineering Students", "Structural Analysts", "Mechanical Researchers", "Technical Institutes", "R&D Centers"],
    features: ["Mechanics Journal Access", "Computational E-Books", "Simulation Video Tutorials", "Research Theses", "Technical Newsletters"],
    icon: "Activity",
    themeColor: "neutral"
  },
  {
    id: "social-sciences",
    name: "Social Sciences",
    description: "Social Sciences are a group of academic disciplines dedicated to examining society. This branch of science studies how people interact with each other, behave, develop as a culture, and influence the world.",
    importance: "Social sciences research is vital for understanding the complexities of human society. It informs public policy, social justice efforts, and our understanding of global cultural trends.",
    contentAvailable: ["35+ Social Science Journals", "Demographic Reports", "Sociological Case Studies", "Cultural Documentary Videos"],
    contentTypes: DEFAULT_CONTENT_TYPES,
    whySubscribe: "Explore research in anthropology, economics, political science, and sociology. Our library provides the critical perspectives needed to navigate and improve our social world.",
    whoShouldSubscribe: ["Social Science Students", "Sociologists", "Economists", "NGOs", "Policy Research Centers"],
    features: ["Social Science Journal Access", "Sociology E-Books", "Documentary Video Series", "Research Theses", "Social Policy Newsletters"],
    icon: "Users",
    themeColor: "gray"
  }
];

export const FEATURED_JOURNALS: Journal[] = [
  {
    id: "j1",
    title: "International Journal of Electrical Systems",
    domainId: "electrical-engineering",
    issn: "2231-1234",
    impactFactor: 3.2,
    description: "A peer-reviewed journal focusing on advanced power systems and smart grid technologies.",
    coverImage: "https://picsum.photos/seed/electrical/400/600",
    frequency: "Quarterly",
    publisher: "Global Science Press"
  },
  {
    id: "j2",
    title: "Journal of Advanced Computing & IT",
    domainId: "computer-it",
    issn: "2231-5678",
    impactFactor: 4.5,
    description: "Covering the latest breakthroughs in AI, Machine Learning, and Cloud Computing.",
    coverImage: "https://picsum.photos/seed/computing/400/600",
    frequency: "Bi-Monthly",
    publisher: "Tech Research Hub"
  }
];

export const PUBLISHER_BENEFITS = [
  { title: "Global Visibility", description: "Reach thousands of academic institutions and researchers across India and beyond.", icon: "Globe" },
  { title: "Revenue Growth", description: "Monetize your content through our robust subscription and pay-per-view models.", icon: "TrendingUp" },
  { title: "Advanced Analytics", description: "Get detailed insights into how your content is being consumed and cited.", icon: "BarChart3" },
  { title: "Secure Hosting", description: "Your intellectual property is protected with state-of-the-art digital rights management.", icon: "ShieldCheck" },
  { title: "Seamless Integration", description: "Easy onboarding process with dedicated support for metadata and full-text ingestion.", icon: "Zap" },
  { title: "Brand Authority", description: "List alongside top-tier publishers and enhance your journal's academic standing.", icon: "Award" },
];

export const AGENCY_BENEFITS = [
  { title: "High Commission", description: "Earn industry-leading commissions on every successful subscription referral.", icon: "IndianRupee" },
  { title: "Recurring Income", description: "Build a sustainable business with commissions on every subscription renewal.", icon: "RefreshCw" },
  { title: "Large Portfolio", description: "Access a vast catalog of 25+ domains and thousands of journals to offer your clients.", icon: "Library" },
  { title: "Dedicated Support", description: "Get a dedicated account manager and marketing materials to help you close deals.", icon: "Headphones" },
  { title: "Real-time Tracking", description: "Monitor your leads, conversions, and earnings through a transparent partner dashboard.", icon: "Activity" },
  { title: "Flexible Partnership", description: "Choose from various partnership levels tailored to your agency's scale and reach.", icon: "Handshake" },
];

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "student-plan",
    name: "Student Scholar",
    userType: "Student",
    description: "Affordable access for individual students to boost their academic performance.",
    features: ["Personalized Dashboard", "Access to 10 Journals", "PDF Downloads", "Mobile App Access"],
    pricing: [
      { duration: "Monthly", price: 499 },
      { duration: "Quarterly", price: 1299 },
      { duration: "Half-Yearly", price: 2299 },
      { duration: "Yearly", price: 3999 }
    ]
  },
  {
    id: "college-plan",
    name: "College Excellence",
    userType: "College",
    description: "Comprehensive access for small to medium academic institutions.",
    features: ["IP-Based Access", "Up to 500 Users", "Usage Analytics", "Librarian Dashboard"],
    pricing: [
      { duration: "Monthly", price: 15000 },
      { duration: "Quarterly", price: 40000 },
      { duration: "Half-Yearly", price: 75000 },
      { duration: "Yearly", price: 135000 }
    ]
  },
  {
    id: "university-plan",
    name: "University Global",
    userType: "University",
    description: "Unlimited access for large universities with multi-campus support.",
    features: ["Unlimited Users", "Remote Access (Shibboleth)", "Advanced Analytics", "Dedicated Support"],
    pricing: [
      { duration: "Monthly", price: 45000 },
      { duration: "Quarterly", price: 120000 },
      { duration: "Half-Yearly", price: 220000 },
      { duration: "Yearly", price: 400000 }
    ]
  },
  {
    id: "corporate-plan",
    name: "Corporate Innovator",
    userType: "Corporate",
    description: "Tailored research access for R&D centers and corporate libraries.",
    features: ["Industry-Specific Content", "R&D Analytics", "Multi-User License", "API Integration"],
    pricing: [
      { duration: "Monthly", price: 25000 },
      { duration: "Quarterly", price: 65000 },
      { duration: "Half-Yearly", price: 120000 },
      { duration: "Yearly", price: 220000 }
    ]
  }
];

export const OPEN_ACCESS_PRICING = [
  { type: "Journal / Article", price: 5000, description: "Standard academic author APC" },
  { type: "Thesis / Dissertation", price: 3000, description: "UG/PG/PhD research work" },
  { type: "Book / E-book", price: 15000, description: "Full book publishing with ISBN support" },
  { type: "Educational Video", price: 8000, description: "Expert lectures and courses" },
  { type: "Conference Proceeding", price: 10000, description: "Full conference paper set" },
  { type: "Newsletter / Magazine", price: 2000, description: "Institutional updates" },
];
