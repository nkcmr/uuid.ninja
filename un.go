// +build js,wasm

package un

import (
	"syscall/js"

	"github.com/satori/go.uuid"
)

func generate_v4() js.Value {
	return js.ValueOf(uuid.NewV4())
}
