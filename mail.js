var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
  auth: {
    user: 'you@example.com',
    pass: 'your-gmail-app-password'
  }
});


module.exports = (destination , subject , text) =>{

  var mailOptions = {
    from: 'you@example.com',
    to: destination,
    subject: subject,
    text: text
  };
  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
}