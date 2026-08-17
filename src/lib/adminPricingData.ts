/**
 * Plan / pricing definitions used ONLY by internal, login-gated tooling
 * (the admin & manager Quotation Wizard). Nothing on the public site imports
 * this file, which keeps prices out of the public page bundle.
 */
import { SubscriptionPlan } from "../types";

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "student-plan",
    name: "Student Scholar",
    userType: "Student",
    description: "Affordable access for individual students to boost their academic performance.",
    pricing: [
      { 
        duration: "Monthly", 
        price: 590, 
        features: ["1 User", "Any 1 Content Categories", "Price applicable per department", "Personalized Dashboard", "Chat Support", "User ID-based access"] 
      },
      { 
        duration: "Quarterly", 
        price: 1590, 
        features: ["1 User", "Any 2 Content Categories", "Price applicable per department", "Personalized Dashboard", "Chat Support", "User ID-based access"] 
      },
      { 
        duration: "Half-Yearly", 
        price: 2990, 
        features: ["1 User", "Any 4 Content Categories", "Price applicable per department", "Personalized Dashboard", "Email Support", "Chat Support", "User ID-based access"] 
      },
      { 
        duration: "Yearly", 
        price: 4990, 
        saveText: "SAVE ₹2,130 ANNUALLY",
        badge: "BEST VALUE - SAVE 30%",
        features: ["1 User", "All Content Categories", "Price applicable per department", "Personalized Dashboard", "Email Support", "Chat Support", "Personalized AI Assistant", "User ID-based access"] 
      }
    ]
  },
  {
    id: "college-plan",
    name: "College Excellence",
    userType: "College",
    description: "Comprehensive access for small to medium academic institutions.",
    pricing: [
      { 
        duration: "Monthly", 
        price: 2490, 
        features: ["1 User", "Any 3 Content Categories", "Price applicable per department", "Personalized Dashboard", "Chat Support", "User ID-based access"] 
      },
      { 
        duration: "Quarterly", 
        price: 6990, 
        features: ["Up to 10 Users", "Any 6 Content Categories", "Price applicable per department", "Personalized Dashboard", "Email Support", "Static IP Based Access", "Usage Analytics"] 
      },
      { 
        duration: "Half-Yearly", 
        price: 12990, 
        features: ["Up to 20 Users", "Any 8 Content Categories", "Price applicable per department", "Personalized Dashboard", "Email Support", "Chat Support", "Static IP Based Access", "Usage Analytics", "Librarian Dashboard", "Student & Faculty Management Dashboard"] 
      },
      { 
        duration: "Yearly", 
        price: 24990, 
        saveText: "SAVE ₹7,970 ANNUALLY",
        badge: "BEST VALUE - SAVE 16%",
        features: ["Up to 100 Users", "All Content Categories", "Price applicable per department", "Personalized Dashboard", "Email Support", "Chat Support", "Personalized AI Assistant", "Static IP Based Access", "Usage Analytics", "Librarian Dashboard", "Student & Faculty Management Dashboard", "Dedicated Support"] 
      }
    ]
  },
  {
    id: "university-plan",
    name: "University Global",
    userType: "University",
    description: "Unlimited access for large universities with single institution focus.",
    pricing: [
      { 
        duration: "Monthly", 
        price: 2990, 
        features: ["Up to 2 Users", "Any 3 Content Categories", "Price applicable per department", "Personalized Dashboard", "Chat Support", "User ID-based access"] 
      },
      { 
        duration: "Quarterly", 
        price: 8990, 
        features: ["Up to 15 Users", "Any 6 Content Categories", "Price applicable per department", "Personalized Dashboard", "Email Support", "Static IP Based Access", "Usage Analytics"] 
      },
      { 
        duration: "Half-Yearly", 
        price: 15990, 
        features: ["Up to 30 Users", "Any 8 Content Categories", "Price applicable per department", "Personalized Dashboard", "Email Support", "Chat Support", "Static IP Based Access", "Usage Analytics", "Librarian Dashboard", "Student & Faculty Management Dashboard"] 
      },
      { 
        duration: "Yearly", 
        price: 29990, 
        saveText: "SAVE ₹11,970 ANNUALLY",
        badge: "BEST VALUE - SAVE 16%",
        features: ["Up to 200 Users", "All Content Categories", "Price applicable per department", "Personalized Dashboard", "Email Support", "Chat Support", "Personalized AI Assistant", "Static IP Based Access", "Usage Analytics", "Librarian Dashboard", "Student & Faculty Management Dashboard", "Dedicated Support"] 
      }
    ]
  },
  {
    id: "corporate-plan",
    name: "Corporate Innovator",
    userType: "Corporate",
    description: "Tailored research access for R&D centers and corporate libraries.",
    pricing: [
      { 
        duration: "Monthly", 
        price: 3990, 
        features: ["Up to 2 Users", "Any 3 Content Categories", "Price applicable per department", "Personalized Dashboard", "Email Support", "User ID-based access"] 
      },
      { 
        duration: "Quarterly", 
        price: 11990, 
        features: ["Up to 15 Users", "Any 6 Content Categories", "Price applicable per department", "Personalized Dashboard", "Email Support", "Static IP Based Access", "Usage Analytics"] 
      },
      { 
        duration: "Half-Yearly", 
        price: 21990, 
        features: ["Up to 30 Users", "Any 8 Content Categories", "Price applicable per department", "Personalized Dashboard", "Email Support", "Chat Support", "Static IP Based Access", "Usage Analytics", "Librarian Dashboard", "Student & Faculty Management Dashboard"] 
      },
      { 
        duration: "Yearly", 
        price: 39990, 
        saveText: "SAVE ₹15,970 ANNUALLY",
        badge: "BEST VALUE - SAVE 16%",
        features: ["Up to 200 Users", "All Content Categories", "Price applicable per department", "Personalized Dashboard", "Email Support", "Chat Support", "Personalized AI Assistant", "Static IP Based Access", "Usage Analytics", "Librarian Dashboard", "Student & Faculty Management Dashboard", "Dedicated Support"] 
      }
    ]
  }
];
