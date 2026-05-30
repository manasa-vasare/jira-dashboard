const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const verifyToken = require('../middleware/authMiddleware');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-for-dev';

// Login Endpoint
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT Token
    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email, campusId: user.campusId },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        campusId: user.campusId
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// Get Current User Profile Endpoint
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        campusId: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(user);
  } catch (error) {
    console.error('Fetch user error:', error);
    res.status(500).json({ error: 'Internal server error fetching profile.' });
  }
});

const crypto = require('crypto');

// Forgot Password Endpoint (Demo Mode)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Return 200 even if user not found to prevent email enumeration
      return res.json({ message: 'If an account with that email exists, a reset token has been generated.' });
    }

    // Generate a random 6-character hex token
    const resetToken = crypto.randomBytes(3).toString('hex').toUpperCase();
    
    // Hash the token before saving to database
    const hashedToken = await bcrypt.hash(resetToken, 10);
    
    // Set expiry to 1 hour from now
    const tokenExpiry = new Date(Date.now() + 3600000);

    await prisma.user.update({
      where: { email },
      data: {
        resetToken: hashedToken,
        resetTokenExpiry: tokenExpiry
      }
    });

    // In a real app, send email here. For demo, return the token!
    res.json({ 
      message: 'Token generated successfully.',
      demoToken: resetToken 
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error during password reset.' });
  }
});

// Reset Password Endpoint
router.post('/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user || !user.resetToken || !user.resetTokenExpiry) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    // Check if token is expired
    if (new Date() > user.resetTokenExpiry) {
      return res.status(400).json({ error: 'Reset token has expired.' });
    }

    // Verify token
    const isTokenValid = await bcrypt.compare(token, user.resetToken);
    if (!isTokenValid) {
      return res.status(400).json({ error: 'Invalid reset token.' });
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear token fields
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedNewPassword,
        resetToken: null,
        resetTokenExpiry: null
      }
    });

    res.json({ message: 'Password reset successfully. You can now log in.' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error during password reset.' });
  }
});

module.exports = router;
