import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Search, BookOpen, CreditCard, Download, Upload, School, User, HelpCircle } from "lucide-react";
import { cn } from "../lib/utils";

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
    icon: <BookOpen className="text-blue-600" size={20} />,
    items: [
      {
        question: "What is STM Digital Library?",
        answer: "STM Digital Library is a premier subscription-based platform providing high-quality academic journals, research papers, and books across various scientific, technical, and medical domains. We bridge the gap between researchers and quality content."
      },
      {
        question: "Who can use this platform?",
        answer: "Our platform is designed for individual researchers, students, faculty members, and institutions like colleges and universities. Anyone looking for peer-reviewed academic content can benefit from our library."
      }
    ]
  },
  {
    id: "subscription",
    title: "Subscription & Payment",
    icon: <CreditCard className="text-emerald-600" size={20} />,
    items: [
      {
        question: "How can I subscribe?",
        answer: "You can subscribe by choosing a plan from our 'Subscription Plans' page. We offer individual and institutional plans. Once you select a plan, you can complete the payment securely via our integrated payment gateway."
      },
      {
        question: "What are the subscription plans?",
        answer: "We offer various plans including Single Journal access, Domain-specific bundles, and Full Library access. Plans are typically available for 1-year or 3-year durations."
      },
      {
        question: "Is there a refund policy?",
        answer: "Refunds are processed on a case-by-case basis. Generally, if you haven't accessed any content within 7 days of purchase, a full refund can be requested. Please refer to our Terms & Conditions for detailed information."
      }
    ]
  },
  {
    id: "access",
    title: "Content Access",
    icon: <Download className="text-purple-600" size={20} />,
    items: [
      {
        question: "How can I access journals/books?",
        answer: "Once subscribed, you can log in to your dashboard and navigate to the 'My Subscriptions' section. From there, you can view and read all content included in your plan directly in your browser."
      },
      {
        question: "Can I download content?",
        answer: "Yes, most of our content is available for download in PDF format for offline reading, depending on your subscription level and the publisher's permissions."
      },
      {
        question: "Is access limited by subscription?",
        answer: "Yes, your access is limited to the specific journals or domains you have subscribed to. However, you can always upgrade your plan to include more content."
      }
    ]
  },
  {
    id: "contribution",
    title: "Content Contribution",
    icon: <Upload className="text-orange-600" size={20} />,
    items: [
      {
        question: "Who can upload content?",
        answer: "Registered authors and researchers can submit their papers for review. We have a strict peer-review process to maintain the quality of our library."
      },
      {
        question: "What types of content are accepted?",
        answer: "We accept original research papers, review articles, case studies, and academic books in the fields of Science, Technology, and Medicine."
      },
      {
        question: "What happens after submission?",
        answer: "After submission, your content goes through a double-blind peer-review process. If accepted, it will be formatted and published in the relevant journal or section of our library."
      }
    ]
  },
  {
    id: "institutional",
    title: "Institutional Access",
    icon: <School className="text-indigo-600" size={20} />,
    items: [
      {
        question: "How can colleges/universities subscribe?",
        answer: "Institutions can contact our sales team or use the 'Institutional Access' page to request a quote. We offer IP-based access and bulk user accounts for large organizations."
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
    icon: <User className="text-rose-600" size={20} />,
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

const AccordionItem: React.FC<{ item: FAQItem; isOpen: boolean; onClick: () => void }> = ({ item, isOpen, onClick }) => {
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={onClick}
        className="flex w-full items-center justify-between py-5 text-left transition-all hover:text-blue-600"
      >
        <span className="text-base font-semibold text-slate-800">{item.question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-slate-400"
        >
          <ChevronDown size={20} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pb-5 text-sm leading-relaxed text-slate-600">
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
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 pt-24 pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-bold text-blue-600 mb-6"
          >
            <HelpCircle size={16} />
            Support Center
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl mb-4"
          >
            Frequently Asked Questions
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-slate-600 max-w-2xl mx-auto mb-10"
          >
            Find answers to common queries about our platform, subscriptions, and content access.
          </motion.p>

          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="relative max-w-xl mx-auto"
          >
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <Search size={20} className="text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search your question..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-slate-900 shadow-xl shadow-slate-200/50 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all"
            />
          </motion.div>
        </div>
      </div>

      {/* FAQ Content */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 mt-16">
        {filteredData.length > 0 ? (
          <div className="space-y-12">
            {filteredData.map((category) => (
              <section key={category.id} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-white shadow-sm border border-slate-100">
                    {category.icon}
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{category.title}</h2>
                </div>
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden px-6">
                  {category.items.map((item, index) => (
                    <AccordionItem
                      key={index}
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
          <div className="text-center py-20">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-4">
              <Search size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No results found</h3>
            <p className="text-slate-500">We couldn't find any answers matching your search.</p>
            <button
              onClick={() => setSearchQuery("")}
              className="mt-6 text-blue-600 font-bold hover:underline"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Still need help? */}
        <div className="mt-20 rounded-3xl bg-blue-600 p-8 md:p-12 text-center text-white shadow-2xl shadow-blue-200">
          <h2 className="text-2xl font-bold mb-4">Still have questions?</h2>
          <p className="text-blue-100 mb-8 max-w-lg mx-auto">
            If you couldn't find the answer you're looking for, please feel free to contact our support team.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="/contact"
              className="rounded-full bg-white px-8 py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-all"
            >
              Contact Support
            </a>
            <a
              href="mailto:support@stmjournals.com"
              className="rounded-full bg-blue-700 px-8 py-3 text-sm font-bold text-white hover:bg-blue-800 transition-all"
            >
              Email Us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
