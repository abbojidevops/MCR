import { TradeKey, TradeTemplate } from '@/types';

export const TRADE_TEMPLATES: Record<TradeKey, TradeTemplate> = {
  plumbing: {
    id: 'plumbing',
    display_name: 'Plumbing & Rooter',
    initial_text_back:
      "{{business_name}}: Sorry we missed your call! Need emergency plumbing service? Reply STOP to opt out.",
    emergency_keywords: ['leak', 'burst', 'flood', 'flooding', 'overflow', 'pipe broke', 'sewage', 'backup', 'no water', 'hot water heater leaking', 'emergency'],
    questions: [
      {
        key: 'emergency',
        text: 'Is this an active emergency (e.g. burst pipe, major flooding, sewage backup)?',
        type: 'boolean',
        step: 'ASK_EMERGENCY',
      },
      {
        key: 'problem',
        text: 'What plumbing issue are you experiencing? (e.g. water heater, clogged drain, toilet leaking)',
        type: 'text',
        step: 'ASK_PROBLEM',
      },
      {
        key: 'address',
        text: 'What is the service address or neighborhood where the work is needed?',
        type: 'address',
        step: 'ASK_ADDRESS',
      },
      {
        key: 'photo',
        text: 'If possible, please reply with a photo of the issue so our technician can prepare parts.',
        type: 'photo',
        step: 'ASK_PHOTO',
      },
    ],
    canned_replies: [
      {
        title: 'Technician on the way',
        shortcut: '/dispatch',
        body: "Thanks for the details! We have dispatched a plumber to your location. Expected arrival within 45 minutes.",
      },
      {
        title: 'Shut off main water valve',
        shortcut: '/shutoff',
        body: "Safety note: If water is actively leaking, locate your main water shutoff valve near the street or basement and turn it clockwise to prevent water damage.",
      },
      {
        title: 'Reviewing photo',
        shortcut: '/photo-received',
        body: "Got your photo! That helps a lot. We have the necessary parts in stock and can be there today. What time works best?",
      },
      {
        title: 'Standard diagnostic fee',
        shortcut: '/pricing',
        body: "Our standard diagnostic dispatch fee is $79, which gets waived if you proceed with the repair. Would you like us to schedule this?",
      },
    ],
  },

  hvac: {
    id: 'hvac',
    display_name: 'Heating & Air Conditioning (HVAC)',
    initial_text_back:
      "{{business_name}}: Sorry we missed your call! Is your heating or AC down? Reply STOP to opt out.",
    emergency_keywords: ['no heat', 'freezing', 'furnace out', 'ac dead', 'ac out', 'no ac', 'burning smell', 'carbon monoxide', 'water leaking ac', 'elderly', 'infant'],
    questions: [
      {
        key: 'emergency',
        text: 'Is your heating or cooling system completely shut down or is someone vulnerable at risk?',
        type: 'boolean',
        step: 'ASK_EMERGENCY',
      },
      {
        key: 'problem',
        text: 'What system is having trouble (Furnace, Heat Pump, Central A/C, Ductless Mini-split)? What are the symptoms?',
        type: 'text',
        step: 'ASK_PROBLEM',
      },
      {
        key: 'address',
        text: 'What is the service address where the HVAC system is located?',
        type: 'address',
        step: 'ASK_ADDRESS',
      },
      {
        key: 'photo',
        text: 'If available, please reply with a photo of the thermostat or the unit model sticker.',
        type: 'photo',
        step: 'ASK_PHOTO',
      },
    ],
    canned_replies: [
      {
        title: 'Emergency dispatch ready',
        shortcut: '/hvac-dispatch',
        body: "We have an emergency HVAC technician available in your area. Can someone be home in the next 60 minutes?",
      },
      {
        title: 'Check thermostat battery',
        shortcut: '/check-thermostat',
        body: "Quick check: Have you tried replacing the batteries in your thermostat and checking if the furnace emergency switch was flipped?",
      },
      {
        title: 'Schedule diagnostic',
        shortcut: '/schedule',
        body: "We have openings today between 1:00 PM and 4:00 PM for a system diagnostic. Does that window work for you?",
      },
    ],
  },

  electrical: {
    id: 'electrical',
    display_name: 'Electrical Services',
    initial_text_back:
      "{{business_name}}: Sorry we missed your call! Electrical emergency? Reply STOP to opt out.",
    emergency_keywords: ['spark', 'sparks', 'smoke', 'burning smell', 'fire', 'hot panel', 'buzzing', 'exposed wire', 'shock', 'power out'],
    questions: [
      {
        key: 'emergency',
        text: 'Is there smoke, sparks, burning odor, or any immediate hazard? (If active fire, please call 911 immediately)',
        type: 'boolean',
        step: 'ASK_EMERGENCY',
      },
      {
        key: 'problem',
        text: 'What electrical issue are you experiencing? (e.g. breaker tripping, outlet dead, panel replacement, EV charger)',
        type: 'text',
        step: 'ASK_PROBLEM',
      },
      {
        key: 'address',
        text: 'What is the service address where electrical assistance is needed?',
        type: 'address',
        step: 'ASK_ADDRESS',
      },
      {
        key: 'photo',
        text: 'Can you text a photo of the breaker panel or the affected switch/outlet?',
        type: 'photo',
        step: 'ASK_PHOTO',
      },
    ],
    canned_replies: [
      {
        title: 'Do not touch caution',
        shortcut: '/safety',
        body: "Please do NOT touch any exposed wiring or sparking outlets. Our master electrician has been alerted and will call you right away.",
      },
      {
        title: 'Panel upgrade estimate',
        shortcut: '/panel',
        body: "We can perform an on-site load calculation and quote for your panel replacement. What day this week works best?",
      },
      {
        title: 'Call in progress',
        shortcut: '/calling',
        body: "Reviewing your electrical request now. I am wrapping up a safety inspection and will call you from this number in 5 minutes.",
      },
    ],
  },

  garage_door: {
    id: 'garage_door',
    display_name: 'Garage Door Repair & Install',
    initial_text_back:
      "{{business_name}}: Sorry we missed your call! Garage door stuck? Reply STOP to opt out.",
    emergency_keywords: ['stuck', 'car trapped', 'cable snapped', 'spring broke', 'crooked door', 'off track', 'won\'t close', 'open to street'],
    questions: [
      {
        key: 'emergency',
        text: 'Is your garage door stuck open or is a vehicle trapped inside?',
        type: 'boolean',
        step: 'ASK_EMERGENCY',
      },
      {
        key: 'problem',
        text: 'What happened? (e.g. broken spring, snapped cable, off track, motor running but not moving)',
        type: 'text',
        step: 'ASK_PROBLEM',
      },
      {
        key: 'address',
        text: 'What is the service address where the garage door is located?',
        type: 'address',
        step: 'ASK_ADDRESS',
      },
      {
        key: 'photo',
        text: 'Please reply with a photo of the springs above the door or where it looks damaged or off-track.',
        type: 'photo',
        step: 'ASK_PHOTO',
      },
    ],
    canned_replies: [
      {
        title: 'Do not pull release cord',
        shortcut: '/spring-warning',
        body: "Caution: If a spring is broken, please do not pull the red emergency release cord, as the heavy door can crash down rapidly.",
      },
      {
        title: 'Truck stocked with springs',
        shortcut: '/in-stock',
        body: "Our trucks carry high-cycle torsion and extension springs in all standard sizes. We can replace it on the first visit today.",
      },
      {
        title: 'Same day window',
        shortcut: '/same-day',
        body: "We have a technician in your neighborhood today. Can we stop by between 2:00 PM and 4:00 PM?",
      },
    ],
  },

  locksmith: {
    id: 'locksmith',
    display_name: 'Locksmith & Security',
    initial_text_back:
      "{{business_name}}: Sorry we missed your call! Locked out right now? Reply STOP to opt out.",
    emergency_keywords: ['locked out', 'keys locked inside', 'child locked', 'pet locked', 'lost keys', 'lock broken', 'break-in'],
    questions: [
      {
        key: 'emergency',
        text: 'Are you locked outside right now, or is a child/pet locked inside?',
        type: 'boolean',
        step: 'ASK_EMERGENCY',
      },
      {
        key: 'problem',
        text: 'What type of lock or service do you need (Residential lockout, Automotive, Rekey, Deadbolt installation)?',
        type: 'text',
        step: 'ASK_PROBLEM',
      },
      {
        key: 'address',
        text: 'What is your exact location or address?',
        type: 'address',
        step: 'ASK_ADDRESS',
      },
      {
        key: 'photo',
        text: 'If possible, send a quick photo of the lock or vehicle make/model.',
        type: 'photo',
        step: 'ASK_PHOTO',
      },
    ],
    canned_replies: [
      {
        title: 'Mobile unit rolling',
        shortcut: '/locksmith-eta',
        body: "Our mobile locksmith van is 15-20 minutes away. Please have your government ID ready to verify address ownership upon arrival.",
      },
      {
        title: 'Vehicle lockout info',
        shortcut: '/car-info',
        body: "What is the year, make, and model of the car? We use damage-free air wedge tools for vehicle openings.",
      },
    ],
  },

  roofing: {
    id: 'roofing',
    display_name: 'Roofing & Gutters',
    initial_text_back:
      "{{business_name}}: Sorry we missed your call! Active roof leak or storm damage? Reply STOP to opt out.",
    emergency_keywords: ['active leak', 'ceiling leaking', 'storm damage', 'tree on roof', 'shingles blown off', 'hole in roof', 'water dripping'],
    questions: [
      {
        key: 'emergency',
        text: 'Is water actively penetrating through your ceiling or attic right now?',
        type: 'boolean',
        step: 'ASK_EMERGENCY',
      },
      {
        key: 'problem',
        text: 'What type of roof service do you need (Emergency tarping, leak repair, storm assessment, full replacement)?',
        type: 'text',
        step: 'ASK_PROBLEM',
      },
      {
        key: 'address',
        text: 'What is the property address?',
        type: 'address',
        step: 'ASK_ADDRESS',
      },
      {
        key: 'photo',
        text: 'Please text photos of the ceiling stain or exterior roof damage if safely visible from ground level.',
        type: 'photo',
        step: 'ASK_PHOTO',
      },
    ],
    canned_replies: [
      {
        title: 'Emergency tarping',
        shortcut: '/tarping',
        body: "We offer emergency roof tarping to prevent interior damage while it rains. We can get a crew there today.",
      },
      {
        title: 'Insurance claim inspection',
        shortcut: '/insurance',
        body: "We provide comprehensive drone and physical roof inspection reports with photos for insurance adjusters. Would you like a free inspection?",
      },
    ],
  },

  landscaping: {
    id: 'landscaping',
    display_name: 'Landscaping & Tree Service',
    initial_text_back:
      "{{business_name}}: Sorry we missed your call! Urgent tree or yard hazard? Reply STOP to opt out.",
    emergency_keywords: ['fallen tree', 'tree on car', 'tree on house', 'branch down', 'hazard', 'powerline near tree', 'blocked driveway'],
    questions: [
      {
        key: 'emergency',
        text: 'Is there a fallen tree or hazardous limb blocking access or threatening a structure?',
        type: 'boolean',
        step: 'ASK_EMERGENCY',
      },
      {
        key: 'problem',
        text: 'What landscaping or tree service are you looking for? (Tree removal, recurring maintenance, irrigation, spring cleanup)?',
        type: 'text',
        step: 'ASK_PROBLEM',
      },
      {
        key: 'address',
        text: 'What is the property address?',
        type: 'address',
        step: 'ASK_ADDRESS',
      },
      {
        key: 'photo',
        text: 'Can you text a photo showing the area or trees that need attention?',
        type: 'photo',
        step: 'ASK_PHOTO',
      },
    ],
    canned_replies: [
      {
        title: 'Free estimate visit',
        shortcut: '/estimate',
        body: "We will be in your neighborhood this Thursday. Can our estimator walk the property to give you an itemized quote?",
      },
      {
        title: 'Emergency tree crew',
        shortcut: '/tree-crew',
        body: "We have a bucket truck and chainsaw crew on standby for hazard removals. Calling you in 2 minutes.",
      },
    ],
  },

  pest_control: {
    id: 'pest_control',
    display_name: 'Pest & Wildlife Control',
    initial_text_back:
      "{{business_name}}: Sorry we missed your call! Urgent pest or wildlife problem? Reply STOP to opt out.",
    emergency_keywords: ['wasp nest', 'bee swarm', 'bat', 'raccoon', 'rat', 'mice', 'bed bugs', 'termite swarm', 'bitten', 'snake'],
    questions: [
      {
        key: 'emergency',
        text: 'Is there aggressive wildlife or stinging insects inside your living area?',
        type: 'boolean',
        step: 'ASK_EMERGENCY',
      },
      {
        key: 'problem',
        text: 'What pest are you seeing? (e.g. rodents, termites, bedbugs, hornets, ants, wildlife in attic)',
        type: 'text',
        step: 'ASK_PROBLEM',
      },
      {
        key: 'address',
        text: 'What is the property address?',
        type: 'address',
        step: 'ASK_ADDRESS',
      },
      {
        key: 'photo',
        text: 'If you have a clear photo of the insect or entry point, please text it over.',
        type: 'photo',
        step: 'ASK_PHOTO',
      },
    ],
    canned_replies: [
      {
        title: 'Inspection scheduled',
        shortcut: '/pest-inspect',
        body: "We can perform a full attic-to-crawlspace pest barrier inspection tomorrow morning. Would 9:00 AM work?",
      },
      {
        title: 'Pet and child safe',
        shortcut: '/safe-treatment',
        body: "All of our botanical and micro-encapsulated treatments are EPA-registered and safe for children and pets once dry.",
      },
    ],
  },
};
