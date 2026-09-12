'use strict';

const { User } = require('../../models');
const authService = require('../../services/authService');
const { profileSchema, changePasswordSchema } = require('../../validators');
const { fieldErrors } = require('../../utils/validation');

async function render(req, res, extra = {}, status = 200) {
  const user = await User.findById(req.user._id).lean();
  res.status(status).render('pages/account', {
    title: 'Your account',
    user,
    values: { name: user.name, phone: user.phone || '' },
    profileErrors: {},
    passwordErrors: {},
    ...extra,
  });
}

const show = (req, res) => render(req, res);

async function update(req, res) {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return render(req, res, { values: req.body, profileErrors: fieldErrors(parsed.error) }, 422);
  }
  await authService.updateProfile(req.user._id, parsed.data);
  req.flash('success', 'Your profile has been updated.');
  return res.redirect(303, '/account');
}

async function changePassword(req, res) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return render(req, res, { passwordErrors: fieldErrors(parsed.error) }, 422);
  }
  try {
    await authService.changePassword(req.user._id, parsed.data);
  } catch (err) {
    if (err.status === 422) return render(req, res, { passwordErrors: err.details }, 422);
    if (err.status === 403) {
      req.flash('warning', err.message);
      return res.redirect(303, '/account');
    }
    throw err;
  }
  req.flash('success', 'Your password has been changed.');
  return res.redirect(303, '/account');
}

module.exports = { show, update, changePassword };
