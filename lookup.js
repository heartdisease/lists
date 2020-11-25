const { DudenLookup } = require('./duden-lookup');
const { WiktionaryLookup } = require('./wiktionary-lookup');

const words = `able
amazing
awake
bitter
bright
certain
clear
common
complex
conscious
cruel
current
dead
deep
dependent
equal
every
flat
frequent
general
great
high
kind
loose
narrow
natural
near
necessary
other
poor
possible
private
probable
public
quick
quiet
ready
regular
responsible
rough
safe
same
separate
serious
sharp
short
smooth
soft
solid
straight
strange
sudden
tall
thick
thin
tight
violent
weak
wide
even
little
much
right
still
any
again
almost
ever
forward
only
quite
together
because
while
though
please
may
act
addition
amount
attempt
attention
bag
basket
behaviour
belief
bit
board
boat
care
chain
change
chest
chin
church
coat
comfort
company
comparison
condition
connection
country
cover
crime
cry
cup
curtain
curve
cushion
damage
decision
degree
destruction
development
direction
discovery
discussion
division
doubt
drop
engine
error
event
exchange
experience
fall
fear
field
flag
flight
foot
force
fork
form
front
growth
guide
gun
hat
humour
increase
invention
journey
knee
knot
knowledge
leaf
library
liquid
loss
map
market
match
material
meat
memory
mind
motion
muscle
note
observation
offer
office
oil
opinion
opposite
order
owner
page
part
payment
pen
pencil
plane
plate
pleasure
pocket
point
poison
pot
power
present
process
punishment
purpose
range
rate
reaction
reason
regret
relation
request
reward
root
salt
scissors
selection
sense
shame
sheep
shelf
ship
shock
side
sign
society
space
square
stage
stamp
statement
step
stomach
store
structure
substance
suggestion
support
surprise
table
tendency
test
theory
thought
throat
tongue
tooth
top
town
trouble
turn
umbrella
unit
value
view
voice
waste
watch
wave
way
weight
wheel
will
wing
wood
wound
across
against
among
about
over
before
to act
to attempt
to be able
to be certain
to believe
to bend
to burst
to care
to chain
to change
to clear
to comfort
to cover
to cry
to doubt
to drop
to exchange
to experience
to fall
to fold
to force
to form
to hang
to increase
to join
to judge
to keep
to lead
to lift
to lock
to mark
to marry
to match
to measure
to mind
to narrow
to offer
to order
to paint
to pin
to point
to present
to print
to process
to produce
to pull
to push
to put
to rate
to regret
to rest
to reward
to ring
to roll
to seem
to sense
to separate
to shut
to sign
to sort
to step
to test
to transport
to trick
to turn
to value
to view
to watch`.split(/\n/);

async function main() {
  try {
    //const lookup = new DudenLookup('./bildungssprache.md');

    //await lookup.createList();
    //await lookup.persist();
    //awaitlookup.createCsv();

    const lookup = new WiktionaryLookup(words);

    await lookup.loadAudioFiles();
  } catch (e) {
    console.error(e);
  }
}

main();
