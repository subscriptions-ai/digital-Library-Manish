import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Search, BookOpen, Key, Download, Upload, School, User, HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, EmptyState, buttonClass } from "./ui";
import { COMPANY_DETAILS } from "../config";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: FAQItem[];
}

const FAQ_DATA: FAQCategory[] = [
  {
    id: "general",
    title: "General Questions",
    icon: <BookOpen size={20} aria-hidden="true" />,
    items: [
      {
        question: "What is STM Digital Library?",
        answer: "STM Digital Library is a platform providing high-quality academic journals, research papers, and books across various scientific, technical, and medical domains. We bridge the gap between researchers and quality content."
      },
      {
        question: "Who can use this platform?",
        answer: "Our platform is designed for individual researchers, students, faculty members, and institutions like colleges and universities. Anyone looking for peer-reviewed academic content can benefit from our library."
      }
    ]
  },
  {
    id: "getting-access",
    title: "Access & Institutional Licensing",
    icon: <Key size={20} aria-hidden="true" />,
    items: [
      {
        question: "How do I get access?",
        answer: "Create a free account and you can start reading straight away, or get in touch through our Contact page. Our team will understand your requirements and set up access for you or your institution."
      },
      {
        question: "What kinds of access are available?",
        answer: "We support individual researcher access as well as institution-wide access for colleges, universities, and corporate R&D centres. Access can be scoped to specific departments and content categories."
      },
      {
        question: "How is access arranged?",
        answer: "Access is arranged directly with our team under a written service agreement with each individual or institution. Please refer to our Terms & Conditions for details."
      }
    ]
  },
  {
    id: "access",
    title: "Content Access",
    icon: <Download size={20} aria-hidden="true" />,
    items: [
      {
        question: "How can I access journals/books?",
        answer: "Once your access is set up, you can log in to your dashboard and view and read all content included in your access directly in your browser."
      },
      {
        question: "Can I download content?",
        answer: "No, content is not available for download. All journals, books, and resources must be read directly online through your browser on the platform."
      },
      {
        question: "Is access limited?",
        answer: "Yes. Access is scoped to the departments and content categories agreed for your account."
      }
    ]
  },
  {
    id: "contribution",
    title: "Listing Content",
    icon: <Upload size={20} aria-hidden="true" />,
    items: [
      {
        question: "Who can list content here?",
        answer: "Publishers and institutions we have an agreement with can submit their catalogue for listing. We index and present the material; we do not peer-review it or act as its publisher."
      },
      {
        question: "What types of content can be listed?",
        answer: "Research papers, review articles, case studies, conference proceedings and academic books across Science, Technology and Medicine — provided the rights holder has agreed to the listing."
      },
      {
        question: "What happens after a submission?",
        answer: "We check the metadata, confirm the licence and the rights position, and then index the material into the relevant department so it becomes discoverable. Copyright stays with the rights holder throughout."
      }
    ]
  },
  {
    id: "institutional",
    title: "Institutional Access",
    icon: <School size={20} aria-hidden="true" />,
    items: [
      {
        question: "How can colleges/universities get access?",
        answer: "Institutions can contact our team or use the 'Institutional Access' page to get in touch. We offer IP-based access and bulk user accounts for large organizations."
      },
      {
        question: "Can institutions track user activity?",
        answer: "Yes, institutional admins get a dedicated dashboard to track usage statistics, popular journals among their users, and overall engagement metrics."
      }
    ]
  },
  {
    id: "account",
    title: "Account & Login",
    icon: <User size={20} aria-hidden="true" />,
    items: [
      {
        question: "How to create an account?",
        answer: "Click on the 'Get Started' or 'Signup' button on the top right of the homepage. Fill in your details, verify your email, and you're ready to go."
      },
      {
        question: "Forgot password process",
        answer: "On the login page, click on 'Forgot Password'. Enter your registered email address, and we will send you a link to reset your password securely."
      }
    ]
  }
];

const AccordionItem: React.FC<{ id: string; item: FAQItem; isOpen: boolean; onClick: () => void }> = ({ id, item, isOpen, onClick }) => {
  const buttonId = `faq-${id}-question`;
  const panelId = `faq-${id}-answer`;
  return (
    <div className="border-b border-rule last:border-0">
      <h3>
        <button
          type="button"
          id={buttonId}
          onClick={onClick}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="group flex w-full items-center justify-between gap-4 py-4 text-left"
        >
          <span className="text-base font-semibold text-ink transition-colors duration-150 group-hover:text-accent">{item.question}</span>
          <motion.span
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 text-muted"
            aria-hidden="true"
          >
            <ChevronDown size={20} />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="max-w-[72ch] pb-5 text-[15px] leading-relaxed text-ink-2">
              {item.answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export function FAQ() {
  const [searchQuery, setSearchQuery] = useState("");
  const [openItems, setOpenItems] = useState<string[]>([]);

  const toggleItem = (id: string) => {
    setOpenItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const filteredData = FAQ_DATA.map(category => ({
    ...category,
    items: category.items.filter(item => 
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(category => category.items.length > 0);

  return (
    <div className="min-h-screen bg-ground pb-16 sm:pb-24">
      {/* Header */}
      <section className="bg-navy">
        <div className="container-public py-12 text-center sm:py-16">
          <p className="on-dark-fill on-dark-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]">
            <HelpCircle size={14} aria-hidden="true" className="text-amber" />
            Support Center
          </p>
          <h1 className="on-dark mt-4 text-3xl font-bold leading-tight sm:text-4xl">
            Frequently Asked Questions
          </h1>
          <p className="on-dark-2 mx-auto mt-4 max-w-2xl text-base sm:text-lg">
            Find answers to common queries about our platform and content access.
          </p>

          {/* Search Bar */}
          <div className="relative mx-auto mt-8 max-w-xl">
            <label htmlFor="faq-search" className="sr-only">Search the questions</label>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4" aria-hidden="true">
              <Search size={18} className="text-muted" />
            </div>
            <input
              id="faq-search"
              type="search"
              placeholder="Search your question..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input h-12 pl-11 text-base"
            />
          </div>
        </div>
      </section>

      {/* FAQ Content */}
      <div className="container-public mt-12 max-w-4xl sm:mt-16">
        {filteredData.length > 0 ? (
          <div className="space-y-10">
            {filteredData.map((category) => (
              <section key={category.id} aria-labelledby={`faq-cat-${category.id}`}>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    {category.icon}
                  </div>
                  <h2 id={`faq-cat-${category.id}`} className="text-xl font-bold text-ink">{category.title}</h2>
                </div>
                <div className="card px-4 sm:px-6">
                  {category.items.map((item, index) => (
                    <AccordionItem
                      key={index}
                      id={`${category.id}-${index}`}
                      item={item}
                      isOpen={openItems.includes(`${category.id}-${index}`)}
                      onClick={() => toggleItem(`${category.id}-${index}`)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="card">
            <EmptyState
              icon={Search}
              title="No results found"
              description="We couldn't find any answers matching your search."
              action={
                <Button variant="outline" onClick={() => setSearchQuery("")}>
                  Clear search
                </Button>
              }
            />
          </div>
        )}

        {/* Still need help? */}
        <div className="card mt-16 p-6 text-center sm:p-10">
          <h2 className="text-2xl font-bold text-ink">Still have questions?</h2>
          <p className="mx-auto mt-3 max-w-lg text-muted">
            If you couldn't find the answer you're looking for, please feel free to contact our support team.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/contact" className={buttonClass("brand")}>
              Contact Support
            </Link>
            <a
              href={`mailto:${COMPANY_DETAILS.email}`}
              className={buttonClass("outline")}
            >
              Email Us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
