## async\_irl

This is still missing a bit from being at its first "ready" state, beware the work in progress.

Initial intended feature set:
- [ ] Load instance data from AWS, into node/cache, into web app
- [ ] Use both client and server cache to populate initial data in app
- [ ] Keep web clients updated in near-real-time
- [ ] Have both WS and REST-like APIs
- [ ] Have callback, promise, and async/await versions of most actions
- [ ] Build new and use existing event emitters
- [ ] Show native JS functionality as much as possible
- [ ] Build out different clients/frontends if this ends up being a useful way to demo patterns

Current code is basically a frontend skeleton, minimal HTTP/WS server, and some connections between them while I played with different libraries and setups. I _think_ this is simple and self-contained enough, but there may be major changes when I start making it functional instead of roughing the structure out.

### Purpose

Demo application using various JS async patterns in more real scenarios.

### Detail

Many callback/promise/async&await/etc tutorials use contrived HTTP calls or setTimeouts to mimic asynchronous behavior. Instead of that, this is going to be a real application: a small dashboard for interacting with AWS EC2 instances. To make it easy to dive into the code this will use minimal (in the future perhaps no) node dependencies and no build chain. The frontend v1 will be React with JSX. Being pretty isn't really the point but we do want it to look passable, so largely using Bootstrap styling (with darker, Halloween themed colors). React without JSX.
