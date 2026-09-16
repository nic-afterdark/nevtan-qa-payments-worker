# This branch does not install

Two deliberate faults in `package.json`, both of which stop the build before any
code runs:

1. `left-pad@^99.99.99` - the package exists, that version does not.
2. `nevtan-internal-billing-sdk@^2.1.0` - the package does not exist at all. This
   is the shape of the most common real failure: a private package that resolves
   on a laptop and not on a build machine.

`package-lock.json` is deleted here too, so the builder has to resolve versions
itself rather than replaying a lock file.

Expected: `npm install` fails with `ETARGET` / `E404`, and the build log shows it.
