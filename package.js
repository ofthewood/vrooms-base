Package.describe({
  name: 'ofthewood:vrooms-base',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: '',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  /* Add our packages that we depend on on both mobile/desktop sides */
  api.use([
    'iron:router',
    'meteor-platform',
    'templating',
    'handlebars',
    'session',
    'underscore'
  ],['client','server']);

  /* Add client side dependencies */
  api.use([
    'jquery'
  ],'client');

  /* Add each of our files that are a part of this package */
  api.add_files([
    'lib/agenda.js'
  ],['client','server']);

  /* Export functions from this package that can be accessed anywhere */
  api.export([
    'Agenda'
  ]);
});

Package.onTest(function(api) {
  api.use('tinytest');
  api.use('ofthewood:vrooms-base');
  api.addFiles('vrooms-base-tests.js');
});
