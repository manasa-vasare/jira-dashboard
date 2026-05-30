const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with central users and B2B projects...');

  // 1. Seed Central Admin User
  const adminEmail = 'admin@apnileap.com';
  const adminPassword = await bcrypt.hash('admin123', 10);
  
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: adminPassword,
      name: 'Central Admin',
      role: 'MODERATOR',
    },
  });
  console.log(`✅ Admin user created/verified: ${admin.email}`);

  // 2. Seed Campus Coordinator Users (for easy testing)
  const coordinators = [
    { email: 'kle@apnileap.com', name: 'KLE Coordinator', role: 'SPONSOR', campusId: '3' },
    { email: 'coep@apnileap.com', name: 'COEP Coordinator', role: 'SPONSOR', campusId: '101' },
    { email: 'mmcoep@apnileap.com', name: 'MMCOEP Coordinator', role: 'SPONSOR', campusId: '102' },
    { email: 'rit@apnileap.com', name: 'RIT Coordinator', role: 'SPONSOR', campusId: '103' },
  ];

  for (const coord of coordinators) {
    const pwd = await bcrypt.hash('spoke123', 10);
    await prisma.user.upsert({
      where: { email: coord.email },
      update: {},
      create: {
        email: coord.email,
        password: pwd,
        name: coord.name,
        role: 'SPONSOR', // Uses coordinator persona permissions in app
        campusId: coord.campusId
      }
    });
    console.log(`✅ Coordinator created/verified: ${coord.email}`);
  }

  // 3. Seed B2B Company Projects
  const projects = [
    {
      company: 'NVIDIA',
      logoUrl: 'https://logo.clearbit.com/nvidia.com?size=80',
      title: 'Autonomous Drone Navigation with Jetson Orin',
      description: 'Develop a real-time obstacle avoidance and path-planning system for delivery drones using NVIDIA Jetson Orin Nano and depth cameras.',
      budget: '$30,000',
      duration: '6 Months',
      status: 'Proposed',
      dateAdded: '2026-05-18',
      initialWorkstream: 'Phase 1: Setup Jetson Orin Nano environment and calibrate depth cameras'
    },
    {
      company: 'NVIDIA',
      logoUrl: 'https://logo.clearbit.com/nvidia.com?size=80',
      title: 'Real-Time Sign Language Translator',
      description: 'Build a GPU-accelerated computer vision pipeline that translates Indian Sign Language gestures into text and speech in real time using deep learning.',
      budget: '$18,000',
      duration: '5 Months',
      status: 'Proposed',
      dateAdded: '2026-05-20',
      initialWorkstream: 'Phase 1: Configure PyTorch on TensorRT and collect ISL gesture baseline dataset'
    },
    {
      company: 'NVIDIA',
      logoUrl: 'https://logo.clearbit.com/nvidia.com?size=80',
      title: 'AI-Powered Traffic Flow Optimization',
      description: 'Create an intelligent traffic signal control system using edge AI inference on NVIDIA hardware to reduce congestion and emergency vehicle wait times.',
      budget: '$35,000',
      duration: '7 Months',
      status: 'Proposed',
      dateAdded: '2026-05-22',
      initialWorkstream: 'Phase 1: Deploy YOLOv8 on Jetson edge devices and capture raw traffic feeds'
    },
    {
      company: 'NVIDIA',
      logoUrl: 'https://logo.clearbit.com/nvidia.com?size=80',
      title: 'Edge AI Smart Agriculture System',
      description: 'Build an AI-based system using Jetson Nano for precision agriculture monitoring, soil health inspection, and pest detection on crops.',
      budget: '$25,000',
      duration: '6 Months',
      status: 'Proposed',
      dateAdded: '2026-05-24',
      initialWorkstream: 'Phase 1: Setup Jetson Nano node in test greenhouse and test moisture sensors'
    },
    {
      company: 'NVIDIA',
      logoUrl: 'https://logo.clearbit.com/nvidia.com?size=80',
      title: 'Isaac Automated Industrial Defect Inspector',
      description: 'Design a high-precision computer vision model deployed on Jetson Orin to automatically inspect PCBs and identify manufacturing anomalies in real time.',
      budget: '$42,000',
      duration: '8 Months',
      status: 'Proposed',
      dateAdded: '2026-05-26',
      initialWorkstream: 'Phase 1: Set up Isaac Sim workspace and import PCB CAD designs'
    },
    {
      company: 'Intel',
      logoUrl: 'https://logo.clearbit.com/intel.com?size=80',
      title: 'Automotive VLSI Controller Chip',
      description: 'Design and verify a micro-controller unit (MCU) for dashboard telemetry and advanced sensor fusion in electric vehicles.',
      budget: '$40,000',
      duration: '9 Months',
      status: 'Proposed',
      dateAdded: '2026-05-24',
      initialWorkstream: 'Phase 1: Configure RTL model and compile system level testbench suite'
    },
    {
      company: 'Google',
      logoUrl: 'https://logo.clearbit.com/google.com?size=80',
      title: 'Cloud-Native Health Tracking API',
      description: 'Develop a secure, high-throughput FHIR-compliant API for sharing electronic medical records seamlessly between clinics and hospitals.',
      budget: '$15,000',
      duration: '4 Months',
      status: 'Proposed',
      dateAdded: '2026-05-26',
      initialWorkstream: 'Phase 1: Implement basic FHIR schema validation and configure OAuth2 layer'
    }
  ];

  for (const proj of projects) {
    const existing = await prisma.project.findFirst({
      where: { 
        company: proj.company,
        title: proj.title 
      }
    });
    
    if (!existing) {
      await prisma.project.create({ data: proj });
      console.log(`✅ Created project: [${proj.company}] ${proj.title}`);
    } else {
      console.log(`⚠️ Project already exists: [${proj.company}] ${proj.title}`);
    }
  }

  console.log('✅ Seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
